/**
 * مجدول داخل عملية الخادم (بديل تشغيل عامل منفصل): ينفّذ مهام التنبيهات دورياً.
 * الآلية: setInterval في Node بعد إقلاع Next من src/instrumentation.ts.
 *
 * لماذا هو آمن للتكرار والتوازي؟
 * - كل تشغيل يحاول حجز JobRun.lockKey (فريد) ⇒ التشغيل المتزامن يُتخطّى SKIPPED.
 * - الإشعارات نفسها Idempotent بقيد Notification.dedupeKey الفريد.
 *
 * عدة عمليات/Workers لنفس القاعدة آمنة للسبب نفسه.
 */
import { notificationService } from '@/modules/notifications/service';
import { todayIn, parseDateOnly } from '@/shared/dates';
import { appTimeZone } from '@/shared/config/settings';
import { prisma } from '@/shared/db/client';
import { runJob, dailyLockKey, hourlyLockKey } from './runner';

/**
 * المهام التي تُشغَّل داخل العملية: التنبيهات المالية/الاشتراكات والوثائق.
 * استُثنيت backup (تكتب ملفات وتستهلك pg_dump عبر child_process) وreconcile —
 * تبقى للعامل/CRON المخصص لتجنب مشاكل بناء Webpack في dev mode.
 */

// حارس عبر globalThis: في وضع التطوير تُعاد تحميل الوحدات كثيرًا، والمؤقت يجب أن يُنشأ مرة واحدة.
const GUARD = Symbol.for('app.inProcessJobsStarted');
type GlobalWithGuard = typeof globalThis & { [GUARD]?: boolean };

async function runExpireSubscriptions(): Promise<void> {
  const tz = appTimeZone();
  const now = new Date();
  const dayKey = todayIn(tz, now);
  const lockKey = dailyLockKey('expire-subscriptions', dayKey);
  
  await runJob('expire-subscriptions', lockKey, async () => {
    const today = parseDateOnly(todayIn(tz));
    const expired = await prisma.subscription.findMany({
      where: { deletedAt: null, status: 'ACTIVE', endDate: { lt: today } },
      select: { id: true, endDate: true, athlete: { select: { firstName: true, lastName: true } } },
      take: 5000,
    });
    
    let processed = 0;
    for (const sub of expired) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'EXPIRED' },
      });
      processed++;
    }
    return processed;
  });
}

async function runGenerateNotifications(): Promise<void> {
  const tz = appTimeZone();
  const now = new Date();
  const dayKey = todayIn(tz, now);
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now),
  );
  const lockKey = hourlyLockKey('generate-notifications', dayKey, hour);
  
  await runJob('generate-notifications', lockKey, async () => {
    const expiring = await notificationService.generateSubscriptionExpiring();
    const expired = await notificationService.generateSubscriptionExpired();
    const debts = await notificationService.generateOverdueDebts();
    const upcoming = await notificationService.generateUpcomingSessions(24);
    const total = expiring + expired + debts + upcoming;
    return {
      itemsProcessed: total,
      message: `expiring=${expiring} expired=${expired} debts=${debts} upcoming=${upcoming}`,
    };
  });
}

async function runExpiringDocuments(): Promise<void> {
  const tz = appTimeZone();
  const now = new Date();
  const dayKey = todayIn(tz, now);
  const lockKey = dailyLockKey('expiring-documents', dayKey);
  
  await runJob('expiring-documents', lockKey, async () => {
    const created = await notificationService.generateDocumentExpiring(30);
    return { itemsProcessed: created };
  });
}

export function startInProcessJobs(intervalMinutes: number): void {
  const g = globalThis as GlobalWithGuard;
  if (g[GUARD]) return;
  g[GUARD] = true;

  let running = false;
  const tick = async () => {
    // تراكُم الدورات غير مرغوب: إذا كانت السابقة لم تنتهِ نتخطى هذه.
    if (running) return;
    running = true;
    try {
      await runExpireSubscriptions();
      await runGenerateNotifications();
      await runExpiringDocuments();
    } catch (e) {
      // لا تُسقط الخادم بسبب دورة مهام — الخطأ transient غالبًا (قاعدة كمونة).
      console.warn('[jobs] دورة فاشلة:', e instanceof Error ? e.message : String(e));
    } finally {
      running = false;
    }
  };

  const minutes = Math.max(1, intervalMinutes);
  // Unref حتى لا يمنع المؤقّت إغلاق العملية في الاختبارات/السكربتات.
  const timer = setInterval(tick, minutes * 60_000);
  timer.unref?.();
  // دورة أولى بعد إقلاع قصير: التنبيهات يجب ألا تنتظر أول فترة كاملة.
  const first = setTimeout(tick, 15_000);
  first.unref?.();
}
