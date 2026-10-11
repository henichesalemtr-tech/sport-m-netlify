import { createHash, timingSafeEqual } from 'node:crypto';
import { apiRoute } from '@/shared/api/route';
import { AppError, ErrorCode } from '@/shared/errors';
import { getEnv } from '@/shared/config/env';
import { runAllJobs } from '@/jobs';

/** مقارنة ثابتة الزمن بعد تجريد الطول (تسرب طول السر غير ذي قيمة عملية هنا). */
function secretsEqual(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * POST /api/v1/jobs/run — تشغيل دورة المهام من مجدول خارج العملية.
 * يُستخدم حيث لا عملية خادم دائمة (دوال Netlify السيرفرية): دالة cron
 * في netlify/functions تستدعي هذا المسار بترويسة x-cron-secret.
 * بلا CRON_SECRET مضبوط يبقى المسار مغلقًا (503) — لا باب خلفي افتراضي.
 */
export const POST = apiRoute({
  auth: false,
  handler: async ({ req }) => {
    const cronSecret = getEnv().CRON_SECRET;
    if (!cronSecret) {
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'تشغيل المهام عن بُعد معطّل: اضبط CRON_SECRET',
      );
    }
    if (!secretsEqual(req.headers.get('x-cron-secret'), cronSecret)) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'مفتاح المهام غير صحيح');
    }
    const { recovered, results } = await runAllJobs(new Date(), 60);
    return {
      data: {
        recoveredStaleRuns: recovered,
        jobs: Object.entries(results).map(([name, outcome]) => ({
          name,
          status: outcome.status,
          itemsProcessed: outcome.itemsProcessed,
          detail: outcome.message ?? outcome.error ?? null,
        })),
      },
    };
  },
});
