# حالة التقدم (PROGRESS)

## ✅ تم التحقق بالتشغيل الفعلي — التحديث الحالي

توفّرت بيئة حقيقية (Node v24 + PostgreSQL مُدار عبر Neon)، فشُغِّل خطّ التحقق الكامل
بالفعل وأُصلحت الأخطاء الحقيقية الناتجة. لم تعد عبارة "UNVERIFIED" تنطبق على الأساس.

النتائج الفعلية (لا أرقام مفبركة — كلها من مخرجات أوامر مُنفَّذة):

| الخطوة | الأمر | النتيجة الفعلية |
|--------|-------|-----------------|
| الأنواع | `npm run typecheck` (tsc --noEmit) | ✅ 0 أخطاء (بدأت الجلسة بـ 44 خطأ TypeScript وأُصلحت جميعها) |
| الأنماط | `npm run lint` (next lint) | ✅ بلا أخطاء ولا تحذيرات |
| اختبارات الوحدة | `npm run test` (vitest) | ✅ **168/168** ناجحة عبر 16 ملفًا |
| توليد العميل | `prisma generate` | ✅ Prisma Client 5.22 |
| تخطيط القاعدة | `prisma db push` | ✅ جُدوَلت كل الجداول على Neon (PostgreSQL) |
| قيود SQL الخام | `prisma db execute -f prisma/raw-constraints.sql` | ✅ مُطبَّقة: btree_gist، pg_trgm، فهارس جزئية (Soft-Delete)، EXCLUDE لمنع تعارض الحصص، قيود CHECK |
| الزرع المرجعي | `npm run seed` | ✅ 72 صلاحية، 223 دور/صلاحية، بيانات مرجعية، 6 فئات عمرية، 14 إعدادًا، Super Admin |
| الزرع التجريبي | `npm run seed:demo` | ✅ حتى النهاية: أنشطتان، قاعة، مدربان، مجموعتان، 3 أولياء، 8 رياضيين، 8 اشتراكات، 12 دفعة، 8 حصص، 2 مصروف |
| البناء | `NODE_ENV=production npm run build` | ✅ نجح — 145 مسارًا مُهيَّأ + نقاط API ديناميكية |
| E2E | `npx playwright test` (chromium، 6 مقاسات) | ✅ **60/60** ناجحة ضد خادم إنتاجي (`next start`) وقاعدة Neon مزروعة |

> ملاحظة تشغيل: `npm run build` يجب أن يُنفَّذ بـ `NODE_ENV=production`. كان `.env`
> (و`.env.example`) يثبّت `NODE_ENV=development`، ما يجعل البناء يحمّل React بنسخة
> التطوير وينهار عند التمهير المسبق لمسارات Next المدمجة (`_not-found`/`_error`).
> أُزيل هذا الضبط من `.env.example` مع توضيح السبب. راجع docs/TESTING.md §التشغيل.

## أخطاء حقيقية اكتُشفت بالتشغيل وأُصلحت

هذه أخطاء فعلية لم تكن لتظهر بلا تشغيل/قاعدة حقيقية:

1. **قفل استشاري — تداخل توقيع**: `pg_advisory_xact_lock(7002, ${fiscalYear})` كان يُرسِل
   المعامَل كـ `bigint` فلا يوجد تداخل `(integer, bigint)` في Postgres ⇒ خطأ 42883.
   أُصلح بجبر النوع: `pg_advisory_xact_lock(<key>, ${fiscalYear}::int)`.
   (payments:7002، receipts:7001)
2. **قيمة الإرجاع `void`**: دوال القفل الاستشاري تُرجع `void` وعجز Prisma عن إزالة
   تحويل العمود ⇒ فشل. أُصلح بتحويلها لاستعلام يُرجع عددًا: `SELECT 1 FROM
   pg_advisory_xact_lock(...)` في المواضع الثلاثة (payments/receipts/cash).
3. **مهلة المعاملة التفاعلية على قاعدة عالية الكمون**: المعاملات المالية (دفعة/اشتراك)
   تنفّذ ~15–20 استعلامًا متسلسلًا، وعند ~227ms ذهابًا وعودة لكل استعلام تتجاوز مهلة
   Prisma الافتراضية (5 ثوانٍ) فتُفشل المعاملة ("Transaction not found"). أُصلح مركزياً
   في `src/shared/db/client.ts` بفرض مهلة/انتظار أعلى (30s/10s) للمعاملات التفاعلية.
4. **تصدير التقرير كان يُسجِّل تدقيقًا بمعرّف كيان غير UUID**: `reports/service.ts`
   كان يمرّر `entityId: type` (نص مثل `expenses`) إلى عمود `entityId @db.Uuid` ⇒ انهيار
   UUID (500). أُصلح بحذف `entityId` (لا كيان واحد للتصدير)؛ النوع يبقى في `metadata.reportType`.
5. **التمهير المسبق لصفحتَي الدخول/الإعداد**: كونَهما خارج مجموعة `(app)` حاول Next
   توليدهما ثابتة، لكن دمج اللغة عبر next-intl يقرأ `headers()` ⇒ DynamicServerError
   أثناء التوليد. أُصلح بوسم الصفحتين `export const dynamic = 'force-dynamic'`.
6. **مهلة E2E في وضع التطوير**: كان `reports/expenses` يبدو بطيئًا (>30s) لأن خادم
   `next dev` يُصرِّف المسار عند الطلب أول مرة. شُغِّلت اختبارات E2E ضد بناء **إنتاجي**
   (`next start`) فاختفت هذه المهل؛ ورُفعت مهلة الاختبار لاستيعاب كمون Neon.
7. **عدم قابلية مساعدات E2E للتكرار/التزامن**: `adminSession` كان يعتمد دائمًا كلمة
   المرور الأصلية بعد تغييرها الإجباري، فيفشل في كل مشروع/عامل لاحق. أُعيدت كتابتها
   لتكون idempotent وآمنة من السباق (تجربة الأصل ثم كلمة الاختبار، وتحمّل تغيير متزامن).

## المراحل (Phases 0–12)

| المرحلة | الوصف | حالة الكود | التحقق التشغيلي |
|---------|-------|------------|-----------------|
| 0 | الأساس: هيكل المستودع، tsconfig (strict)، Tailwind+RTL، ESLint/Prettier، vitest/playwright، .env.example | ✅ | ✅ typecheck/lint/build نظيفة |
| 1 | مخطط القاعدة: `schema.prisma` + `raw-constraints.sql` | ✅ | ✅ db push + تطبيق القيود الخام على Postgres فعلي |
| 2 | الطبقة المشتركة `src/shared/*` | ✅ | ✅ مغطاة بالاختبارات + التشغيل |
| 3 | المصادقة/التفويض: login/logout/change-password، brute-force، جلسات DB، requirePermission، TOTP | ✅ | ✅ E2E: 401/403/ترويسات/قفل؛ TOTP مُغطّى باختبار وحدة (لم يُجرَّب بمصادقة ثنائية حية عبر UI) |
| 4 | الكيانات: sports/age-categories/venues/coaches/parents/athletes/groups | ✅ | ✅ seed:demo + unit (168) + E2E إنشاء مستخدم/صلاحية |
| 5 | الجدولة والحضور: sessions (تكرار + EXCLUDE)، attendance، scan | ✅ | ✅ db push يطبّق EXCLUDE؛ seed يُنشئ حصصًا؛ اختبار تكرار يمرّ. التزامن العالي تحت ضغط متوازٍ: لم يُقَس صراحة |
| 6 | الماليات: subscription-types/subscriptions/payments/receipts/expenses/cash | ✅ | ✅ seed:demo يُنشئ دفعات/إيصالات/خزينة؛ unit؛ E2E دورة مالية كاملة (فتح→مصروف→تقرير→CSV) |
| 7 | التقارير واللوحة: 14 نوعًا + export CSV/Excel، dashboard | ✅ | ✅ E2E report+CSV export ناجح (بعد إصلاح #4). XLSX/باقي الأنواع: لم تُجتَر كلها |
| 8 | المستندات/الإشعارات/الاستيراد | ✅ | ⚠️ لم تُجتَر عبر E2E (الاستيراد يتطلب ملفات؛ القنوات معطلة قصدا) |
| 9 | الإدارة/التشغيل: users/roles/settings/audit-logs/backups/jobs | ✅ | ⚠️ backups (pg_dump) وjobs لم تُشغَّل؛ audit يعمل (يكتب السجل فعليًا) |
| 10 | التدعيم الأمني: ترويسات/CSP، تعقيم CSV، magic bytes، fail-fast env | ✅ | ✅ E2E تحقّق X-Frame/CSP/nosniff + رفض float/3 خانات + 404 |
| 11 | الواجهة (UI): layout + ui-kit + شاشات/صفحات لكل الوحدات + دخول + 2FA | ✅ | ✅ بناء إنتاجي + E2E دخان عبر 6 مقاسات. التفاعلات العميقة لكل شاشة لم تُجتَر آليًا |
| 12 | الاختبارات + السكربتات + الوثائق | ✅ | ✅ unit(168)+E2E(60/60)+seed/demo. seed-load/backup/restore/worker لم تُشغَّل |

## ما لم يتحقق بعد (بصدق)

- **Docker/docker-compose**: لم تُبنَ الصورة في هذه البيئة.
- **backups/restore** (`scripts/backup.ts`/`restore.ts`): تعتمد `pg_dump`/`psql` — لم تُشغَّل.
- **worker + المهام المجدولة** (`scripts/worker.ts`)، و**seed-load** (اختبار أحمال): لم تُشغَّل.
- **التحقق المتزامن الثقيل** لتعارض الحصص (EXCLUDE) ودفعات متزامنة تحت ضغط عالٍ متوازٍ
  متعدد العمال على نفس الصفوف — لم يُقس صراحة.
- **2FA عبر الواجهة** و**استيراد Excel** و**معظم تدفقات UI العميقة لكل شاشة**: خارج نطاق
  دخان E2E الحالي.

## أوامر إعادة التحقق (بيئة حقيقية)

```bash
export NODE_ENV=production            # مهم للبناء
npm install
cp .env.example .env                  # املأ DATABASE_URL (مضيف مباشر لـ Neon للـ DDL) + الأسرار
npm run typecheck && npm run lint && npm run test
npx prisma db push --force-reset      # أو prisma migrate dev
npx prisma db execute --file prisma/raw-constraints.sql
SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run seed
npm run seed:demo
npm run build                         # NODE_ENV=production
npx playwright install chromium       # + headless shell
# شغّل خادمًا على :3000 (next start للموثوقية/الترويسات الكاملة) ثم:
SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... E2E_PASSWORD=... npx playwright test
```
