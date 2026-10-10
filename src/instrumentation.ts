/**
 * نقطة إقلاع Next (node runtime): تشغيل مجدول المهام داخل العملية.
 * يُفعَّل افتراضيًا؛ يُعطَّل بـ JOBS_IN_PROCESS=false عند استخدام عامل/CRON منفصل.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { getEnv } = await import('@/shared/config/env');
    const env = getEnv();
    if (!env.JOBS_IN_PROCESS) return;
    const { startInProcessJobs } = await import('@/jobs/scheduler');
    startInProcessJobs(env.JOBS_INTERVAL_MINUTES);
  } catch (e) {
    // إقلاع المجدول لا يجب أن يُسقط الخادم — البيئة غير الصالحة تُكتشف عند أول طلب.
    console.warn('[instrumentation] تعذّر تشغيل مجدول المهام:', e instanceof Error ? e.message : String(e));
  }
}
