# اتفاقيات الكود — دليل إلزامي لكل مساهم/وكيل

هذا الملف هو مصدر الحقيقة للأنماط. التزم به حرفيًا لضمان اتساق الكود.

## البنية

```
src/
  modules/<module>/
    schema.ts        # مخططات Zod (مشتركة FE/BE)
    repository.ts    # الاستعلامات فقط + تطبيق النطاق (Scoping)
    service.ts       # منطق الأعمال + Transactions + Audit
    routes/          # App Router route handlers تحت app/api/v1/...
    <module>.test.ts # اختبارات
  shared/            # db, auth, permissions, money, dates, errors, audit, api, i18n, storage, validation, text
  app/               # Next.js App Router (UI + api routes)
```

## الطبقات (فصل صارم — 4.2)

- **route**: يستدعي `apiRoute(...)` من `@/shared/api/route`. يمرر مخطط Zod للـ body/params. داخل الـ handler: `requirePermission` ثم استدعاء service. لا منطق أعمال هنا.
- **service**: كل قواعد العمل، Transactions، Audit. يرمي `AppError` عند الفشل.
- **repository**: استعلامات Prisma فقط + تطبيق نطاق البيانات. لا قواعد عمل.

## قواعد غير قابلة للتفاوض

1. **ممنوع `any`**. استخدم أنواعًا محددة أو `unknown`.
2. **ممنوع `role === 'ADMIN'`** في منطق التفويض. استخدم `requirePermission(ctx, 'module.action')`.
3. **المال BigInt بأصغر وحدة**. استخدم دوال `@/shared/money`. ممنوع float.
4. **كل عملية مالية/متعددة الخطوات داخل `prisma.$transaction`** مع Audit في نفس المعاملة.
5. **ممنوع catch فارغ**. إما معالجة أو إعادة رمي `AppError`.
6. **لا نصوص صلبة في الواجهة**. كل النصوص عبر i18n (`useTranslations` / `getTranslations`).
7. **Soft Delete**: استخدم `deletedAt`. كل استعلام قائمة يفلتر `deletedAt: null`.
8. **التعديل المتزامن**: كل كيان يحمل `version`. عند التحديث تحقق من `version` وإلا رمي `VERSION_CONFLICT` (409).

## نمط route handler

```ts
// src/app/api/v1/athletes/route.ts
import { apiRoute, paginated } from '@/shared/api/route';
import { listQuerySchema } from '@/shared/api/query';
import { requirePermission } from '@/shared/permissions/guard';
import { athleteService } from '@/modules/athletes/service';

export const GET = apiRoute({
  params: listQuerySchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    requirePermission(user, 'athletes.view'); // انتظر await
    const result = await athleteService.list({ user, query: params });
    return paginated(result.items, result.total, params.page, params.pageSize);
  },
});
```

ملاحظة: `requirePermission` يعيد Promise — استخدم `await requirePermission(...)`.

## نمط service

```ts
export const athleteService = {
  async create(input: CreateAthleteInput, meta: Meta) {
    return prisma.$transaction(async (tx) => {
      // 1) قواعد العمل والتحقق
      // 2) الإنشاء
      // 3) writeAudit({ ... }, tx)
      return created;
    });
  },
};
```

حيث `Meta = { user: AuthContext; requestId: string; ip?: string; userAgent?: string }`.

## الأخطاء

ارمِ من `@/shared/errors`: `notFound`, `forbidden`, `conflict`, `businessRule`, `validationError`, أو `new AppError(ErrorCode.X, msg)`. لا ترمِ أخطاء خام.

## API conventions (4.3)

- المسار: `/api/v1/<resource>` و `/api/v1/<resource>/{id}`.
- النجاح: `{ data, meta? }`. الفشل: `{ error: { code, message, fieldErrors?, requestId } }` (يديره `apiRoute` تلقائيًا).
- القوائم: `?page&pageSize&q&sort&<filters>` — pageSize ≤ 100.
- العمليات الحساسة للتكرار تقبل ترويسة `Idempotency-Key` + قيد فريد في الجدول.

## الاختبارات

Vitest. اختبارات unit للمنطق المالي/التواريخ/العمر. اختبارات integration للـ services على PostgreSQL حقيقي (تُشغَّل عند توفر البيئة). لا تُضعف اختبارًا لينجح.

## RTL والواجهة

- `dir="rtl"`، استخدم Logical Properties (`ms-/me-/ps-/pe-`).
- خط Cairo محلي.
- الحقول الرقمية/البريد تبقى LTR (`dir="ltr"` على الحقل).
