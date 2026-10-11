/**
 * CLI لاستعادة نسخة احتياطية — غلاف حول backupService.restore الذي ينفذ:
 *   1) نسخة أمان تلقائية قبل الاستعادة (pre-restore) — إن فشلت تُلغى العملية.
 *   2) تفعيل وضع الصيانة (Setting: system.maintenanceMode).
 *   3) mysql < ملف النسخة (استيراد SQL نصّي).
 *   4) Audit + تسجيل restoredAt. إنهاء وضع الصيانة عند النجاح فقط.
 *
 * الاستخدام:
 *   npm run restore -- --id=<backupRecordId> --reason="سبب مفصل (10 أحرف على الأقل)"
 *   npm run restore -- --file=backup-daily-2026-01-01T00-00-00.sql --reason="..."
 *   npm run restore -- --list
 *
 * التأكيد: يجب كتابة RESTORE حرفيًا في الطرفية (أو تمرير --confirm=RESTORE
 * للأتمتة غير التفاعلية). لا يوجد تجاوز بلا تأكيد.
 *
 * الإسناد في Audit: يُسند السجل لأول مستخدم SUPER_ADMIN موجود في القاعدة
 * (حقل audit_logs.userId له FK ولا يقبل معرفات وهمية). إن لم يوجد أي
 * Super Admin تُرفض العملية.
 *
 * المتطلبات: mysql (أدوات عميل MySQL/MariaDB) مثبت وفي PATH أو مُشار إليه بـ MYSQL_BIN.
 * شُغِّلت فعليًا على MariaDB 10.11 (أكتوبر 2026): استعادة نسخة يدوية نجحت، مع نسخة
 * أمان تلقائية قبلها، وإنهاء وضع الصيانة بعد النجاح. ملاحظة: الاستيراد يستبدل جدول
 * backup_records بنسخته القديمة، فتُعيد الخدمة بناء صفوف النسخة المستعاد منها ونسخة
 * الأمان بعد النجاح، وتُنظِّف سياسة الاحتفاظ أي سجل بلا ملف على القرص.
 */
import './load-env';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

function getArg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const { prisma } = await import('@/shared/db/client');
  const { backupService } = await import('@/modules/backups/service');
  const { backupRepository } = await import('@/modules/backups/repository');

  if (process.argv.includes('--list')) {
    const all = await backupRepository.listAll();
    if (all.length === 0) {
      console.log('[restore] لا توجد سجلات نسخ احتياطي.');
      return;
    }
    console.log('[restore] النسخ المتاحة:');
    for (const b of all) {
      console.log(`  ${b.id}  ${b.kind.padEnd(8)} ${String(b.sizeBytes).padStart(12)}B  ${b.fileName}`);
    }
    return;
  }

  const id = getArg('id');
  const fileName = getArg('file');
  const reason = getArg('reason');
  if (!id && !fileName) {
    throw new Error('حدد النسخة: --id=<uuid> أو --file=<fileName> (أو --list للعرض).');
  }
  if (!reason || reason.trim().length < 10) {
    throw new Error('--reason إلزامي (10 أحرف على الأقل) — يُسجَّل في Audit.');
  }

  const record = id
    ? await backupRepository.findById(id)
    : (await backupRepository.listAll()).find((b) => b.fileName === fileName);
  if (!record) throw new Error('النسخة المحددة غير موجودة في السجلات — جرّب --list.');

  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    throw new Error('لا يوجد مستخدم SUPER_ADMIN لإسناد سجل Audit — أنشئه أولًا (npm run seed مع SEED_ADMIN_*).');
  }

  console.log('==================== تحذير: استعادة نسخة احتياطية ====================');
  console.log(`الملف     : ${record.fileName}`);
  console.log(`المعرف    : ${record.id}`);
  console.log(`النوع     : ${record.kind}`);
  console.log(`تاريخها   : ${record.createdAt.toISOString()}`);
  console.log(`SHA-256   : ${record.checksum ?? '(غير متوفر)'}`);
  console.log('ستُستبدل كل بيانات القاعدة الحالية (بعد إنشاء نسخة أمان تلقائية).');
  console.log('=====================================================================');

  const confirmFlag = getArg('confirm');
  let answer: string;
  if (confirmFlag) {
    answer = confirmFlag;
  } else {
    const rl = createInterface({ input: stdin, output: stdout });
    answer = (await rl.question('اكتب RESTORE حرفيًا للتأكيد: ')).trim();
    rl.close();
  }
  if (answer !== 'RESTORE') {
    console.log('[restore] أُلغيت العملية (لم تُكتب كلمة التأكيد).');
    return;
  }

  const meta = {
    user: {
      userId: admin.id,
      role: admin.role,
      email: admin.email,
      fullName: admin.fullName,
      linkedCoachId: admin.linkedCoachId,
    },
    requestId: `cli-restore-${Date.now()}`,
    userAgent: 'restore-cli',
  };

  const result = await backupService.restore(
    { backupId: record.id, confirm: 'RESTORE', reason: reason.trim() },
    meta,
  );
  console.log(`[restore] تمت الاستعادة من: ${result.restoredFrom}`);
  console.log(`[restore] نسخة الأمان قبل الاستعادة: ${result.preRestoreBackupId ?? '(لا شيء)'}`);
  console.log('[restore] تحقق من التطبيق ثم أكد إنهاء وضع الصيانة إن بقي مفعّلًا.');
}

main()
  .catch(async (e) => {
    console.error('[restore] فشل:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import('@/shared/db/client');
    await prisma.$disconnect();
  });
