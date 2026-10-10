/**
 * مهمة: تنبيه الوثائق القريبة من الانتهاء (نافذة 30 يومًا)
 * وتعليم المنتهية EXPIRED — Idempotent عبر dedupeKey.
 */
import { notificationService } from '@/modules/notifications/service';
import { todayIn } from '@/shared/dates';
import { appTimeZone } from '@/shared/config/settings';
import { runJob, dailyLockKey } from './runner';
import type { JobTaskResult, JobOutcome } from './runner';

export const jobName = 'expiring-documents';

export async function expiringDocuments(): Promise<JobTaskResult> {
  const created = await notificationService.generateDocumentExpiring(30);
  return { itemsProcessed: created };
}

export async function run(now: Date): Promise<JobOutcome> {
  const dayKey = todayIn(appTimeZone(), now);
  return runJob(jobName, dailyLockKey(jobName, dayKey), expiringDocuments);
}
