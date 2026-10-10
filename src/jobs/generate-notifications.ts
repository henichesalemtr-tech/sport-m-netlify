/**
 * مهمة: توليد الإشعارات الدورية (Idempotent عبر dedupeKey):
 * - اشتراكات قاربت على الانتهاء / انتهت.
 * - ديون متأخرة.
 * - جلسات قادمة خلال 24 ساعة.
 * قفل ساعي ⇒ يمكن استدعاؤها كل ساعة بلا تكرار إشعارات.
 */
import { notificationService } from '@/modules/notifications/service';
import { todayIn } from '@/shared/dates';
import { appTimeZone } from '@/shared/config/settings';
import { runJob, hourlyLockKey } from './runner';
import type { JobTaskResult, JobOutcome } from './runner';

export const jobName = 'generate-notifications';

export async function generateNotifications(): Promise<JobTaskResult> {
  const expiring = await notificationService.generateSubscriptionExpiring();
  const expired = await notificationService.generateSubscriptionExpired();
  const debts = await notificationService.generateOverdueDebts();
  const upcoming = await notificationService.generateUpcomingSessions(24);
  const total = expiring + expired + debts + upcoming;
  return {
    itemsProcessed: total,
    message: `expiring=${expiring} expired=${expired} debts=${debts} upcoming=${upcoming}`,
  };
}

export async function run(now: Date): Promise<JobOutcome> {
  const tz = appTimeZone();
  const dayKey = todayIn(tz, now);
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now),
  );
  return runJob(jobName, hourlyLockKey(jobName, dayKey, hour), generateNotifications);
}
