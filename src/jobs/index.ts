/**
 * سجل المهام المجدولة (Registry):
 * كل مهمة في ملف مستقل، وهنا تجميعها + تشغيلها فرديًا أو جماعيًا.
 * كل المهام Idempotent عبر JobRun.lockKey (راجع runner.ts).
 */
import * as expireSubscriptionsJob from './expire-subscriptions';
import * as generateNotificationsJob from './generate-notifications';
import * as expiringDocumentsJob from './expiring-documents';
import * as backupJob from './backup';
import * as reconcileJob from './reconcile';
import { recoverStaleJobs, type JobOutcome } from './runner';

export interface ScheduledJob {
  name: string;
  /** تنفيذ المهمة بسجل JobRun مقفل — لا يرمي أخطاء، يعيد النتيجة. */
  run(now: Date): Promise<JobOutcome>;
}

export const JOBS: ScheduledJob[] = [
  { name: expireSubscriptionsJob.jobName, run: expireSubscriptionsJob.run },
  { name: generateNotificationsJob.jobName, run: generateNotificationsJob.run },
  { name: expiringDocumentsJob.jobName, run: expiringDocumentsJob.run },
  { name: backupJob.jobName, run: backupJob.run },
  { name: reconcileJob.jobName, run: reconcileJob.run },
];

export function getJob(name: string): ScheduledJob | undefined {
  return JOBS.find((job) => job.name === name);
}

export interface RunAllResult {
  recovered: number;
  results: Record<string, JobOutcome>;
}

/**
 * تشغيل كل المهام تسلسليًا (مناسب لمجدول/CRON واحد).
 * يبدأ باسترداد المهام المنقطعة (RUNNING قديمة) ثم ينفذ المهام.
 */
export async function runAllJobs(now: Date = new Date(), staleMinutes = 60): Promise<RunAllResult> {
  const recovered = await recoverStaleJobs(staleMinutes);
  const results: Record<string, JobOutcome> = {};
  for (const job of JOBS) {
    results[job.name] = await job.run(now);
  }
  return { recovered, results };
}

/**
 * تشغيل مجموعة مختارة من المهام بالاسم (تُستخدم للمجدول داخل العملية).
 * يسبقها استرداد المهام المنقطعة حتى لا تبقى أقفال معلّقة.
 */
export async function runJobsByName(
  names: readonly string[],
  now: Date = new Date(),
  staleMinutes = 60,
): Promise<{ recovered: number; results: Record<string, JobOutcome> }> {
  const recovered = await recoverStaleJobs(staleMinutes);
  const results: Record<string, JobOutcome> = {};
  for (const name of names) {
    const job = getJob(name);
    if (job) results[name] = await job.run(now);
  }
  return { recovered, results };
}

export { runJob, recoverStaleJobs, dailyLockKey, hourlyLockKey, chunk } from './runner';
export type { JobOutcome, JobTaskResult } from './runner';
