/**
 * مهمة: نسخة احتياطية مجدولة عبر mysqldump.
 * - نوع النسخة حسب التاريخ (يومي/أسبوعي/شهري — GFS).
 * - تفشل بلطف (JobRun FAILED برسالة واضحة) إذا كانت الأداة غير متوفرة.
 * - enforceRetention بعد كل نسخة ناجحة.
 */
import { backupService } from '@/modules/backups/service';
import { scheduledKind } from '@/modules/backups/retention';
import { todayIn } from '@/shared/dates';
import { appTimeZone } from '@/shared/config/settings';
import { runJob, dailyLockKey } from './runner';
import type { JobTaskResult, JobOutcome } from './runner';

export const jobName = 'backup';

export async function runBackup(now: Date): Promise<JobTaskResult> {
  const kind = scheduledKind(now);
  // meta = null ⇒ نسخة آلية بلا مستخدم (يُسجَّل createdBy فارغ)
  const record = await backupService.create(null, { kind });
  const removed = await backupService.enforceRetention(null);
  return {
    itemsProcessed: 1,
    message: `${kind} backup ${record.fileName} (${record.sizeBytes.toString()} bytes), retention removed ${removed}`,
  };
}

export async function run(now: Date): Promise<JobOutcome> {
  const dayKey = todayIn(appTimeZone(), now);
  return runJob(jobName, dailyLockKey(jobName, dayKey), () => runBackup(now));
}
