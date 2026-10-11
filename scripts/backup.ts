/**
 * CLI لإنشاء نسخة احتياطية عبر mysqldump — غلاف حول backupService
 * (نفس المسار المستخدم من الواجهة/المهام المجدولة):
 *   mysqldump → ملف .sql في BACKUP_DIR → سجل BackupRecord (+checksum SHA-256)
 *   → Audit → تطبيق سياسة الاحتفاظ GFS.
 *
 * الاستخدام:
 *   npm run backup                     # يدوي (kind=manual)
 *   npm run backup -- --kind=daily     # daily | weekly | monthly | manual
 *   npm run backup -- --kind=auto      # يُشتق النوع من تاريخ اليوم (GFS — نفس منطق المهمة المجدولة)
 *
 * المتطلبات: mysqldump مثبت وفي PATH (أدوات عميل MySQL/MariaDB).
 * شُغِّل فعليًا على MariaDB 10.11 (أكتوبر 2026): نسخ يدوي عبر mysqldump ينتج ملف SQL
 * حقيقيًا مع SHA-256 وسجل في backup_records وتطبيق سياسة الاحتفاظ (GFS).
 * يتطلب mysqldump في PATH أو MYSQLDUMP_BIN في .env (يأتي مع XAMPP في C:\xampp\mysql\bin).
 */
import './load-env';

async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith('--kind='));
  const requested = (arg?.split('=')[1] ?? 'manual') as string;

  const { backupService } = await import('@/modules/backups/service');
  const { scheduledKind } = await import('@/modules/backups/retention');

  const kind: 'manual' | 'daily' | 'weekly' | 'monthly' =
    requested === 'auto'
      ? scheduledKind(new Date())
      : (['manual', 'daily', 'weekly', 'monthly'] as const).includes(requested as never)
        ? (requested as 'manual' | 'daily' | 'weekly' | 'monthly')
        : (() => {
            throw new Error(`--kind غير صالح: ${requested} (manual|daily|weekly|monthly|auto)`);
          })();

  const tools = await backupService.checkToolsAvailable();
  if (!tools.mysqldump) {
    throw new Error('mysqldump غير متوفر — ثبّت أدوات MySQL/MariaDB (تأتي مع XAMPP في C:\\xampp\\mysql\\bin) وأضفها إلى PATH.');
  }

  console.log(`[backup] إنشاء نسخة (${kind})...`);
  const record = await backupService.create(null, { kind });
  console.log('[backup] تم:');
  console.log(`  الملف    : ${record.fileName}`);
  console.log(`  المسار   : ${record.storageKey}`);
  console.log(`  الحجم    : ${record.sizeBytes} bytes`);
  console.log(`  SHA-256  : ${record.checksum ?? '(غير متوفر)'}`);
  console.log(`  المعرّف  : ${record.id}`);
  console.log('[backup] طُبِّقت سياسة الاحتفاظ (GFS) تلقائيًا بعد النسخ.');
}

main()
  .catch(async (e) => {
    console.error('[backup] فشل:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import('@/shared/db/client');
    await prisma.$disconnect();
  });
