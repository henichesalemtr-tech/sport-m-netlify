/**
 * مهمة: إنهاء الاشتراكات المنتهية (ACTIVE و endDate < اليوم ⇒ EXPIRED)
 * + إشعار SUBSCRIPTION_EXPIRED عبر dedupeKey (Idempotent).
 * التنفيذ في معاملات مجزّأة لتفادي الإطالة.
 */
import { prisma } from '@/shared/db/client';
import { todayIn, parseDateOnly } from '@/shared/dates';
import { appTimeZone } from '@/shared/config/settings';
import { emitNotification } from '@/modules/notifications/service';
import { dedupeKeys } from '@/modules/notifications/dedupe';
import { chunk, runJob, dailyLockKey } from './runner';
import type { JobTaskResult, JobOutcome } from './runner';

const CHUNK_SIZE = 100;

export async function expireSubscriptions(): Promise<JobTaskResult> {
  const today = parseDateOnly(todayIn(appTimeZone()));

  const expired = await prisma.subscription.findMany({
    where: { deletedAt: null, status: 'ACTIVE', endDate: { lt: today } },
    select: { id: true, endDate: true, athlete: { select: { firstName: true, lastName: true } } },
    take: 5000,
  });

  let processed = 0;
  for (const batch of chunk(expired, CHUNK_SIZE)) {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { id: { in: batch.map((s) => s.id) }, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
      for (const sub of batch) {
        await emitNotification(
          {
            type: 'SUBSCRIPTION_EXPIRED',
            title: 'انتهى اشتراك لاعب',
            body: `انتهى اشتراك ${sub.athlete.firstName} ${sub.athlete.lastName} بتاريخ ${sub.endDate.toISOString().slice(0, 10)}.`,
            entityType: 'Subscription',
            entityId: sub.id,
            dedupeKey: dedupeKeys.subscriptionExpired(sub.id, sub.endDate),
            roleTarget: 'RECEPTION',
          },
          tx,
        );
      }
    });
    processed += batch.length;
  }

  return { itemsProcessed: processed };
}

export const jobName = 'expire-subscriptions';

export async function run(now: Date): Promise<JobOutcome> {
  const dayKey = todayIn(appTimeZone(), now);
  return runJob(jobName, dailyLockKey(jobName, dayKey), expireSubscriptions);
}
