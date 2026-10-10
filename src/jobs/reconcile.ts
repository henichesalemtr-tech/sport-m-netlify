/**
 * مهمة: مطابقة paidAmount في الاشتراكات مع مجموع الدفعات المكتملة الفعلية.
 * - المصدر الحقيقي: مجموع netAmount للدفعات COMPLETED لكل اشتراك.
 * - أي اختلاف ⇒ تصحيح paidAmount في معاملات مجزّأة.
 * - عدد العناصر المعالجة = عدد الاشتراكات المصححة.
 */
import { prisma } from '@/shared/db/client';
import { chunk, runJob, dailyLockKey } from './runner';
import { todayIn } from '@/shared/dates';
import { appTimeZone } from '@/shared/config/settings';
import type { JobTaskResult, JobOutcome } from './runner';

export const jobName = 'reconcile';

const CHUNK_SIZE = 100;
const MAX_SUBSCRIPTIONS = 20_000;

export async function reconcilePaidAmounts(): Promise<JobTaskResult> {
  const sums = await prisma.payment.groupBy({
    by: ['subscriptionId'],
    where: { status: 'COMPLETED' },
    _sum: { netAmount: true },
  });
  const actualBySubscription = new Map<string, bigint>();
  for (const row of sums) {
    actualBySubscription.set(row.subscriptionId, row._sum.netAmount ?? 0n);
  }

  const subscriptions = await prisma.subscription.findMany({
    where: { deletedAt: null },
    select: { id: true, paidAmount: true },
    take: MAX_SUBSCRIPTIONS,
  });

  const fixes: Array<{ id: string; paidAmount: bigint }> = [];
  for (const sub of subscriptions) {
    const actual = actualBySubscription.get(sub.id) ?? 0n;
    if (sub.paidAmount !== actual) fixes.push({ id: sub.id, paidAmount: actual });
  }

  for (const batch of chunk(fixes, CHUNK_SIZE)) {
    await prisma.$transaction(
      batch.map((fix) =>
        prisma.subscription.update({
          where: { id: fix.id },
          data: { paidAmount: fix.paidAmount },
        }),
      ),
    );
  }

  return {
    itemsProcessed: fixes.length,
    message: fixes.length > 0 ? `تم تصحيح paidAmount لـ ${fixes.length} اشتراك` : 'لا توجد فروقات',
  };
}

export async function run(now: Date): Promise<JobOutcome> {
  const dayKey = todayIn(appTimeZone(), now);
  return runJob(jobName, dailyLockKey(jobName, dayKey), reconcilePaidAmounts);
}
