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
import { getEnv } from '@/shared/config/env';
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
  // بلا أدوات MySQL على النظام (دوال Netlify السيرفرية) لا جدوى من تشغيلها كل مرة:
  // تُعطَّل صراحةً وتصبح النسخ مسؤولية مزوّد القاعدة.
  if (!getEnv().BACKUP_JOB_ENABLED) {
    return {
      status: 'SKIPPED',
      jobRunId: null,
      itemsProcessed: 0,
      message: 'مهمة النسخ معطّلة (BACKUP_JOB_ENABLED=false)',
    };
  }
  const dayKey = todayIn(appTimeZone(), now);
  return runJob(jobName, dailyLockKey(jobName, dayKey), () => runBackup(now));
}
