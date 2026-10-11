/**
 * دالة Netlify مجدولة (cron) — بديل المجدول داخل العملية (src/instrumentation.ts)
 * الذي لا يعمل في بيئة سيرفرless قصيرة العمر. تستدعي /api/v1/jobs/run على نفس
 * الموقع، فيجري التنفيذ داخل دوال Next حيث الاتصال بقاعدة البيانات والإعدادات جاهزان.
 *
 * لماذا waitUntil: حد الدوال المجدولة 30 ثانية، ودورة المهام على قاعدة بعيدة قد
 * تتجاوزها؛ الرد يُعاد فورًا ويُستكمل العمل بعد إرساله.
 */
async function runJobsCycle(req, context) {
  const baseUrl = Netlify.env.get('URL') ?? context.site?.url;
  const cronSecret = Netlify.env.get('CRON_SECRET');
  if (!baseUrl || !cronSecret) {
    console.warn('[run-jobs] CRON_SECRET أو URL الموقع غير مضبوط — تُتخطّى الدورة');
    return new Response('disabled', { status: 204 });
  }

  const cycle = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/jobs/run`, {
        method: 'POST',
        headers: { 'x-cron-secret': cronSecret },
      });
      console.warn(`[run-jobs] ${res.status} ${(await res.text()).slice(0, 400)}`);
    } catch (e) {
      console.error('[run-jobs] فشل الاستدعاء', e);
    }
  };

  if (typeof context.waitUntil === 'function') {
    context.waitUntil(cycle());
  } else {
    await cycle();
  }
  return new Response('dispatched', { status: 202 });
}

export default runJobsCycle;

export const config = {
  // كل 15 دقيقة (UTC) — نفس وتيرة JOBS_INTERVAL_MINUTES الافتراضية محليًا.
  schedule: '*/15 * * * *',
};
