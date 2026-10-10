/**
 * Worker/Cron داخل العملية (بدون Redis — انظر docs/DECISIONS.md).
 * يشغّل سجل المهام في src/jobs (expire-subscriptions, generate-notifications,
 * expiring-documents, backup, reconcile) عبر runAllJobs().
 *
 * كل مهمة Idempotent بقفل JobRun.lockKey (يومي/ساعي) — لذا التشغيل المتكرر
 * أو وجود أكثر من عامل آمن: التشغيل المزدوج يُتخطى (SKIPPED) بلا ضرر.
 *
 * الاستخدام:
 *   npm run worker                 # حلقة دائمة كل WORKER_INTERVAL_MINUTES (افتراضي 15)
 *   npm run worker -- --once       # دورة واحدة ثم خروج — مناسب لـ cron/systemd timer.
 * مثال crontab (كل 15 دقيقة):
 *     0,15,30,45 * * * * cd /app && npm run worker -- --once
 *
 * لم يُشغَّل هذا السكربت في بيئة التوثيق (لا يتوفر node/npm/docker/postgres هنا).
 */
import './load-env';

const INTERVAL_MINUTES = Math.max(1, Number(process.env.WORKER_INTERVAL_MINUTES ?? 15));

let stopping = false;

function log(msg: string): void {
  console.log(`[worker ${new Date().toISOString()}] ${msg}`);
}

async function cycle(): Promise<void> {
  const { runAllJobs } = await import('@/jobs');
  const { recovered, results } = await runAllJobs(new Date(), 60);
  if (recovered > 0) log(`استُردت ${recovered} مهمة منقطعة (RUNNING قديمة → FAILED)`);
  for (const [name, outcome] of Object.entries(results)) {
    if (outcome.status === 'SUCCESS') {
      log(`✔ ${name}: SUCCESS (${outcome.itemsProcessed} عنصر) ${outcome.message ?? ''}`);
    } else if (outcome.status === 'SKIPPED') {
      log(`↷ ${name}: SKIPPED — ${outcome.message ?? 'قفل قائم'}`);
    } else {
      log(`✘ ${name}: FAILED — ${outcome.error ?? 'خطأ غير معروف'}`);
    }
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  log(`بدء العامل (interval=${INTERVAL_MINUTES}m, once=${once})`);

  process.on('SIGINT', () => {
    stopping = true;
    log('إشارة إيقاف (SIGINT) — إنهاء بعد الدورة الحالية...');
  });
  process.on('SIGTERM', () => {
    stopping = true;
    log('إشارة إيقاف (SIGTERM) — إنهاء بعد الدورة الحالية...');
  });

  do {
    try {
      await cycle();
    } catch (e) {
      // أخطاء runAllJobs نفسها (مثل انقطاع الاتصال بقاعدة البيانات) — لا تُسقط العامل
      log(`خطأ في الدورة: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!once && !stopping) {
      await new Promise((r) => setTimeout(r, INTERVAL_MINUTES * 60_000));
    }
  } while (!once && !stopping);

  const { prisma } = await import('@/shared/db/client');
  await prisma.$disconnect();
  log('توقف العامل.');
}

main().catch((e) => {
  console.error('[worker] فشل قاتل:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
