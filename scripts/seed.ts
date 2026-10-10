/**
 * Seed مرجعي آمن للإنتاج — بيانات أساسية فقط، Idempotent (قابل لإعادة التشغيل).
 *
 * ينشئ:
 *  1) كل الصلاحيات الدقيقة (catalog.ts → allPermissionCodes + أكواد إضافية
 *     مرجعية من المسارات/المصفوفة الافتراضية — انظر EXTRA_ROUTE_CODES).
 *  2) مصفوفة الأدوار الافتراضية (DEFAULT_ROLE_PERMISSIONS) كصفوف
 *     user_role_permissions (granted=true) — قابلة للتخصيص لاحقًا من Super Admin.
 *  3) طرق الدفع، فئات المصاريف، أنواع الوثائق، الفئات العمرية الافتراضية.
 *  4) الإعدادات الافتراضية (نفس مفاتيح/قيم COMMON_SETTINGS في
 *     src/modules/settings/service.ts) — تُنشأ فقط إن كانت غير موجودة
 *     (skipDuplicates) حتى لا تُدهس قيم عدّلها المستخدم.
 *
 * لا ينشئ مستخدمين بكلمات مرور معروفة.
 * إنشاء أول Super Admin:
 *  - الخيار الموثق حاليًا: متغيرات بيئة اختيارية
 *      SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD (+ SEED_ADMIN_FULL_NAME اختياري)
 *    → يُنشأ الحساب بتجزئة Argon2id ويُطبع تنبيه لتغيير كلمة المرور فورًا.
 *  - ملاحظة أمانة: مسار "Setup Wizard" في الواجهة غير منفَّذ بعد في هذا المستودع
 *    (لا يوجد route له تحت src/app/api/v1) — انظر docs/PROGRESS.md.
 *
 * التشغيل: npm run seed   (أي: tsx scripts/seed.ts)
 * لم يُشغَّل هذا السكربت في بيئة التوثيق (لا يتوفر node/npm/postgres هنا) —
 * انظر docs/TESTING.md و docs/PROGRESS.md.
 */
import './load-env';
import { prisma } from '@/shared/db/client';
import { hashPassword } from '@/shared/auth/password';
import {
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  allPermissionCodes,
} from '@/shared/permissions/catalog';
import type { UserRole } from '@prisma/client';

/**
 * أكواد صلاحيات تُستخدم فعلًا في مسارات API أو في المصفوفة الافتراضية
 * لكنها غير مشتقة من allPermissionCodes() (الكتالوج يعرّف manage فقط
 * لـ sports/venues/age_categories، ولا يعرّف expenses.export).
 * نبذرّها حتى تعمل المصفوفة الافتراضية وrequirePermission في المسارات فعليًا.
 * انظر docs/USER_ROLES.md (ملاحظة اتساق الكتالوج).
 */
const EXTRA_ROUTE_CODES: string[] = [
  'sports.view',
  'venues.view',
  'age_categories.view',
  'expenses.export',
];

const PAYMENT_METHODS = [
  { name: 'نقدًا', sortOrder: 0 },
  { name: 'تحويل بنكي', sortOrder: 1 },
  { name: 'بطاقة بنكية', sortOrder: 2 },
  { name: 'شيك', sortOrder: 3 },
  { name: 'أخرى', sortOrder: 99 },
];

const EXPENSE_CATEGORIES = [
  { name: 'رواتب ومنح', sortOrder: 0 },
  { name: 'إيجار', sortOrder: 1 },
  { name: 'صيانة', sortOrder: 2 },
  { name: 'معدات وعتاد رياضي', sortOrder: 3 },
  { name: 'ماء وكهرباء', sortOrder: 4 },
  { name: 'نقل وتنقلات', sortOrder: 5 },
  { name: 'اتصالات وإنترنت', sortOrder: 6 },
  { name: 'مصاريف أخرى', sortOrder: 99 },
];

const DOCUMENT_TYPES = [
  { name: 'شهادة طبية', sortOrder: 0 },
  { name: 'وثيقة هوية', sortOrder: 1 },
  { name: 'ترخيص الولي', sortOrder: 2 },
  { name: 'صورة شمسية', sortOrder: 3 },
  { name: 'شهادة مدرسية', sortOrder: 4 },
  { name: 'عقد العضوية', sortOrder: 5 },
  { name: 'وثيقة أخرى', sortOrder: 99 },
];

/** الفئات العمرية الافتراضية — تُنشأ فقط إذا كان الجدول فارغًا (لا قيد فريد على الاسم). */
const AGE_CATEGORIES = [
  { name: 'براعم', kind: 'NORMAL' as const, minAge: 6, maxAge: 9, sortOrder: 0 },
  { name: 'أصاغر', kind: 'NORMAL' as const, minAge: 10, maxAge: 12, sortOrder: 1 },
  { name: 'أشبال', kind: 'NORMAL' as const, minAge: 13, maxAge: 14, sortOrder: 2 },
  { name: 'أواسط', kind: 'NORMAL' as const, minAge: 15, maxAge: 17, sortOrder: 3 },
  { name: 'آمال', kind: 'NORMAL' as const, minAge: 18, maxAge: 19, sortOrder: 4 },
  { name: 'أكابر', kind: 'SENIOR' as const, minAge: 20, maxAge: null, sortOrder: 5 },
];

/** نفس مفاتيح وقيم COMMON_SETTINGS في src/modules/settings/service.ts (قيم مخزنة كنص). */
const DEFAULT_SETTINGS = [
  { key: 'org.name', value: '', valueType: 'string', group: 'org', description: 'اسم المنظمة' },
  { key: 'currency.code', value: 'DZD', valueType: 'string', group: 'currency', description: 'رمز العملة' },
  { key: 'currency.decimals', value: '2', valueType: 'number', group: 'currency', description: 'عدد الخانات العشرية' },
  { key: 'timezone', value: 'Africa/Algiers', valueType: 'string', group: 'general', description: 'المنطقة الزمنية للمؤسسة' },
  { key: 'fiscal.startMonth', value: '9', valueType: 'number', group: 'fiscal', description: 'شهر بداية السنة المالية' },
  { key: 'number.system', value: 'arab', valueType: 'string', group: 'general', description: 'نظام الأرقام (arab|latn)' },
  { key: 'attendance.lateMinutes', value: '10', valueType: 'number', group: 'attendance', description: 'حد التأخر بالدقائق' },
  { key: 'attendance.consecutiveAbsenceAlert', value: '3', valueType: 'number', group: 'attendance', description: 'عدد الغيابات المتتالية للتنبيه' },
  { key: 'subscription.expiringDays', value: '7', valueType: 'number', group: 'subscription', description: 'أيام التنبيه قبل انتهاء الاشتراك' },
  { key: 'payment.allowOverpay', value: 'false', valueType: 'boolean', group: 'payment', description: 'السماح بالدفع الزائد' },
  { key: 'receipt.template', value: 'A4', valueType: 'string', group: 'receipt', description: 'قالب الوصل (A4|80mm)' },
  { key: 'scan.dedupSeconds', value: '10', valueType: 'number', group: 'scan', description: 'ثواني منع تكرار المسح' },
  { key: 'athletes.registrationFormat', value: 'ATH-{YYYY}-{SEQ:5}', valueType: 'string', group: 'athletes', description: 'صيغة رقم التسجيل' },
  { key: 'auth.totpEnabled', value: 'false', valueType: 'boolean', group: 'auth', description: 'تفعيل التحقق الثنائي TOTP' },
];

async function seedPermissions(): Promise<Map<string, string>> {
  const codes = Array.from(new Set([...allPermissionCodes(), ...EXTRA_ROUTE_CODES]));
  const codeToId = new Map<string, string>();
  for (const code of codes) {
    const module = code.split('.')[0] ?? code;
    const description =
      module in PERMISSIONS ? `صلاحية ${code} (وحدة ${module})` : `صلاحية ${code} (مرجعية من المسارات)`;
    const row = await prisma.permission.upsert({
      where: { code },
      update: { module, description },
      create: { code, module, description, isSystem: true },
    });
    codeToId.set(code, row.id);
  }
  console.log(`[seed] الصلاحيات: ${codeToId.size} (upsert)`);
  return codeToId;
}

async function seedRoleMatrix(codeToId: Map<string, string>): Promise<void> {
  const roles = Object.keys(DEFAULT_ROLE_PERMISSIONS) as UserRole[];
  let rows = 0;
  let skipped = 0;
  for (const role of roles) {
    const grants = DEFAULT_ROLE_PERMISSIONS[role];
    const codes =
      grants === 'ALL' ? Array.from(codeToId.keys()) : (grants as string[]);
    for (const code of codes) {
      const permissionId = codeToId.get(code);
      if (!permissionId) {
        console.warn(`[seed] تحذير: كود صلاحية غير معروف تخطّيناه: ${role} → ${code}`);
        skipped++;
        continue;
      }
      await prisma.userRolePermission.upsert({
        where: { role_permissionId: { role, permissionId } },
        update: { granted: true },
        create: { role, permissionId, granted: true },
      });
      rows++;
    }
  }
  console.log(`[seed] مصفوفة الأدوار: ${rows} صف (granted=true)، تخطّي ${skipped}`);
}

async function seedReferenceData(): Promise<void> {
  for (const m of PAYMENT_METHODS) {
    await prisma.paymentMethod.upsert({
      where: { name: m.name },
      update: { sortOrder: m.sortOrder },
      create: { name: m.name, sortOrder: m.sortOrder, isActive: true },
    });
  }
  for (const c of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { name: c.name },
      update: { sortOrder: c.sortOrder },
      create: { name: c.name, sortOrder: c.sortOrder, isActive: true },
    });
  }
  for (const d of DOCUMENT_TYPES) {
    await prisma.documentType.upsert({
      where: { name: d.name },
      update: { sortOrder: d.sortOrder },
      create: { name: d.name, sortOrder: d.sortOrder, isActive: true },
    });
  }
  console.log(
    `[seed] بيانات مرجعية: ${PAYMENT_METHODS.length} طرق دفع، ${EXPENSE_CATEGORIES.length} فئات مصاريف، ${DOCUMENT_TYPES.length} أنواع وثائق`,
  );

  const ageCount = await prisma.ageCategory.count();
  if (ageCount === 0) {
    await prisma.ageCategory.createMany({
      data: AGE_CATEGORIES.map((a) => ({ ...a, seasonStartMonth: 9, isActive: true })),
    });
    console.log(`[seed] الفئات العمرية: ${AGE_CATEGORIES.length} (أُنشئت لأن الجدول فارغ)`);
  } else {
    console.log(`[seed] الفئات العمرية: موجودة مسبقًا (${ageCount}) — لم تُلمس`);
  }
}

async function seedSettings(): Promise<void> {
  const result = await prisma.setting.createMany({
    data: DEFAULT_SETTINGS,
    skipDuplicates: true,
  });
  console.log(
    `[seed] الإعدادات: أُنشئ ${result.count} من ${DEFAULT_SETTINGS.length} (الموجود مسبقًا لا يُدهس)`,
  );
}

async function seedBootstrapAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log(
      '[seed] لم يُنشأ أي مستخدم. لإنشاء أول Super Admin اضبط SEED_ADMIN_EMAIL و SEED_ADMIN_PASSWORD ' +
        '(أو استخدم Setup Wizard عند توفره في الواجهة).',
    );
    return;
  }
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD يجب أن تكون 8 أحرف على الأقل (سياسة كلمات المرور)');
  }
  const fullName = process.env.SEED_ADMIN_FULL_NAME?.trim() || 'مدير النظام';
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: {}, // لا نُعدّل كلمة مرور حساب قائم عند إعادة التشغيل (Idempotent آمن)
    create: {
      email,
      fullName,
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      mustChangePassword: true,
    },
  });
  console.log(
    `[seed] Super Admin: ${email} — جاهز. غيّر كلمة المرور فور أول دخول (mustChangePassword=true).`,
  );
}

async function main(): Promise<void> {
  console.log('[seed] بدء الـ Seed المرجعي (آمن للإنتاج، Idempotent)...');
  const codeToId = await seedPermissions();
  await seedRoleMatrix(codeToId);
  await seedReferenceData();
  await seedSettings();
  await seedBootstrapAdmin();
  console.log('[seed] اكتمل. تذكّر تطبيق قيود SQL الخام: psql "$DATABASE_URL" -f prisma/raw-constraints.sql');
}

main()
  .catch((e) => {
    console.error('[seed] فشل:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
