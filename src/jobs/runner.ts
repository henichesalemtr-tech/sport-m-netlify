/**
 * عدّاء المهام المجدولة (src/jobs):
 * - كل تشغيل يُسجَّل في JobRun مع lockKey فريد يمنع التشغيل المزدوج (Idempotent).
 * - P2002 على lockKey ⇒ المهمة نُفّذت/تُنفَّذ الآن ⇒ تخطٍّ بلا خطأ.
 * - عند النجاح: SUCCESS + finishedAt + itemsProcessed + تحرير القفل.
 * - عند الفشل: FAILED + رسالة الخطأ + تحرير القفل (ليعاد لاحقًا بمفتاح يوم جديد).
 * - recoverStaleJobs: استرداد المهام المتوقفة (RUNNING قديمة) بعد انقطاع العملية.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/shared/db/client';

export type JobTaskResult = number | { itemsProcessed: number; message?: string };

export interface JobOutcome {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  jobRunId: string | null;
  itemsProcessed: number;
  message?: string;
  error?: string;
}

/** مفتاح قفل يومي: name:YYYY-MM-DD — تشغيل واحد لكل مهمة في اليوم. */
export function dailyLockKey(jobName: string, dayKey: string): string {
  return `${jobName}:${dayKey}`;
}

/** مفتاح قفل ساعي: name:YYYY-MM-DD:HH — لمهام توليد الإشعارات المتكررة. */
export function hourlyLockKey(jobName: string, dayKey: string, hour: number): string {
  return `${jobName}:${dayKey}:${String(hour).padStart(2, '0')}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * تنفيذ مهمة داخل سجل JobRun مقفل بـ lockKey.
 * لا يرمي الخطأ للخارج — يعيد JobOutcome بنجاح/فشل/تخطٍ.
 */
export async function runJob(
  jobName: string,
  lockKey: string,
  task: () => Promise<JobTaskResult>,
): Promise<JobOutcome> {
  let jobRunId: string;
  try {
    const run = await prisma.jobRun.create({
      data: { jobName, status: 'RUNNING', startedAt: new Date(), lockKey },
    });
    jobRunId = run.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // القفل محجوز ⇒ تشغيل مزدوج ⇒ تخطٍ Idempotent
      return { status: 'SKIPPED', jobRunId: null, itemsProcessed: 0, message: 'مقفلة — تشغيل سابق قائم أو مكتمل' };
    }
    throw err;
  }

  try {
    const result = await task();
    const itemsProcessed = typeof result === 'number' ? result : result.itemsProcessed;
    const message = typeof result === 'number' ? undefined : result.message;
    await prisma.jobRun.update({
      where: { id: jobRunId },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        itemsProcessed,
        error: message ?? null,
        lockKey: null, // تحرير القفل بعد التثبيت
      },
    });
    return { status: 'SUCCESS', jobRunId, itemsProcessed, message };
  } catch (err) {
    const message = errorMessage(err);
    await prisma.jobRun.update({
      where: { id: jobRunId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        error: message.slice(0, 2000),
        lockKey: null,
      },
    });
    return { status: 'FAILED', jobRunId, itemsProcessed: 0, error: message };
  }
}

/**
 * استرداد المهام المنقطعة: أي JobRun بحالة RUNNING أقدم من staleMinutes
 * يُعلَّم FAILED ويُحرَّر قفله (لم تُكمل العملية السابقة بسبب انهيار/إعادة نشر).
 */
export async function recoverStaleJobs(staleMinutes = 60): Promise<number> {
  const threshold = new Date(Date.now() - staleMinutes * 60_000);
  const result = await prisma.jobRun.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: threshold } },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      error: `استرداد: انقطع التنفيذ (أقدم من ${staleMinutes} دقيقة)`,
      lockKey: null,
    },
  });
  return result.count;
}

/** تقسيم مصفوفة إلى دفعات (للمعاملات المجزّأة). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
