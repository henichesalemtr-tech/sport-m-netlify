# حالة التقدم (PROGRESS)

## ✅ تم التحقق بالتشغيل الفعلي — التحديث الحالي

المشروع يعمل محليًا على **MariaDB 10.11** (نقل من PostgreSQL/Neon — ADR-13 في `docs/DECISIONS.md`).
**سلسلة التحقق الكاملة شُغِّلت فعلًا على MariaDB المحلية يوم 2026-10-11** (قاعدة
`sports_management`)، وأُصلحت أثناءها أخطاء حقيقية — انظر §"أخطاء حقيقية اكتُشفت بالتشغيل وأُصلحت".
المُتحقَّق بالتشغيل المحلي (2026-10-11): `npx prisma db push` + تطبيق `prisma/raw-constraints.sql`،
`npm run seed` و`npm run seed:demo`، `typecheck` و`lint --max-warnings=0`، `vitest run` (180 اختبارًا)،
`NODE_ENV=production next build`، **E2E Playwright 66/66**، `backup`/`restore`/`worker --once`،
تنبيهات انتهاء الاشتراك مع dedupe، والدخول واللوحة وبطاقة طباعة الرياضي ومعالج الاستيراد في المتصفح.
**بقي غير مُتحقَّق منه:** `npm run seed:load` والأحمال وقياسات P95/`EXPLAIN FORMAT=JSON`،
تدفق 2FA الحيّ عبر UI (وحدوي فقط)، تعارض الحصص تحت تزامن متوازٍ حقيقي،
قاعدة متصفح offline-first + المزامنة السحابية (غير منفّذة أصلًا)، وبناء Docker.
أي رقم أداء من حقبة Neon/PostgreSQL أدناه **تاريخي** ولا يصف بيئة MySQL الحالية.

النتائج الفعلية (لا أرقام مفبركة — كلها من مخرجات أوامر نُفِّذت):

| الخطوة | الأمر | النتيجة الفعلية |
|--------|-------|-----------------|
| الأنواع | `npm run typecheck` (tsc --noEmit) | ✅ **0 أخطاء** — مُتحقَّق تشغيليًا (MariaDB، 2026-10-11)؛ تاريخيًا بدأت الجلسة بـ 44 خطأ وأُصلحت |
| الأنماط | `npm run lint -- --max-warnings=0` | ✅ "No ESLint warnings or errors" — مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) |
| اختبارات الوحدة | `npx vitest run` | ✅ **180 اختبارًا / 18 ملفًا** (0 فشل) — مُتحقَّق تشغيليًا (MariaDB، 2026-10-11)؛ أُضيف `src/modules/imports/imports.test.ts` (9 اختبارات) |
| توليد العميل | `prisma generate` | ✅ Prisma Client 5.22 |
| تخطيط القاعدة | `npx prisma db push` | ✅ على MariaDB المحلية (بعد `mysql -u root -e "CREATE DATABASE ... utf8mb4_unicode_ci"`)؛ سابقًا على Neon/PostgreSQL |
| قيود SQL الخام | `mysql -u root sports_management < prisma/raw-constraints.sql` | ✅ مُطبَّقة على MariaDB: قيود CHECK مالية/منطقية + جدول `app_locks` (بديل الأقفال الاستشارية). **لا** EXCLUDE gist ولا فهارس جزئية ولا pg_trgm/btree_gist ولا REVOKE — لا وجود لها في MySQL؛ كشف تعارض الحصص والتفرّد مع الحذف الناعم في طبقة التطبيق |
| الزرع المرجعي | `npm run seed` | ✅ 72 صلاحية، 223 دور/صلاحية، بيانات مرجعية، 6 فئات عمرية، 14 إعدادًا، Super Admin |
| الزرع التجريبي | `npm run seed:demo` | ✅ حتى النهاية: أنشطتان، قاعة، مدربان، مجموعتان، 3 أولياء، 8 رياضيين، 8 اشتراكات، 12 دفعة، 8 حصص، 2 مصروف |
| البناء | `NODE_ENV=production npx next build` | ✅ **exit 0** — مُتحقَّق تشغيليًا (MariaDB، 2026-10-11)؛ كان 145 مسارًا على Neon (تاريخي) |
| E2E | `npx playwright test` (6 مشاريع مقاسات) | ✅ **66/66** ضد قاعدة `sports_management` المحلية — مُتحقَّق تشغيليًا (MariaDB، 2026-10-11)؛ وأُضيف `tests/e2e/40-import-ui.spec.ts` (معالج الاستيراد الحقيقي: رفع ← ربط أعمدة ← معاينة صفيَّين مرفوضين ← اعتماد ← تنزيل ملف الأخطاء والتحقق من محتواه، مع التأكد أن **لا رياضيًا أُنشئ** من الصفوف المرفوضة) |
| النسخ الاحتياطي | `npm run backup` | ✅ ملف `.sql` حقيقي بـ 242059 بايت في `storage/backups` + SHA-256 + صف في `backup_records` + تطبيق احتفاظ GFS |
| الاستعادة | `npm run restore -- --id=... --reason=... --confirm=RESTORE` | ✅ حتى النهاية على MariaDB: نسخة أمان تلقائية قبل الاستعادة ← `mysql < dump` ← وسم `restoredAt` ← عودة `system.maintenanceMode` إلى false ← البيانات سليمة (عدد الصفوف قبل/بعد) |
| worker | `npm run worker -- --once` | ✅ كل المهام SUCCESS في `job_runs` (مسح صلاحيات، إبطال جلسات، تنبيهات انتهاء اشتراك، نسخة مجدولة، recoverStaleJobs)؛ التشغيل الثاني → SKIPPED على نفس `lock_key` |
| تنبيهات انتهاء الاشتراك | `worker --once` بعد تقديم تاريخ نهاية اشتراك ACTIVE إلى اليوم+3 | ✅ 3 إشعارات بالضبط (RECEPTION/ADMIN/SUPER_ADMIN)؛ إعادة التشغيل → 0 إشعار جديد (`dedupeKey`) |
| استيراد عبر API | رفع `.xlsx` بـ 5 صفوف عبر نقاط الاستيراد | ✅ upload 200 ← ربط تلقائي لـ 12 حقلًا ← معاينة (5 / 2 صالحة / 2 مرفوضة / 1 مكرر) ← اعتماد: إدخال صفيَّين مع `sportId` من الاسم العربي وحقول الطوارئ وأرقام تسجيل تلقائية (ATH-2026-00010/00011) + ملف أخطاء بكل الأسباب |
| الواجهة (متصفح) | `http://localhost:3000` | ✅ نموذج الدخول، اللوحة ببيانات حقيقية، وبطاقة طباعة الرياضي على `/{locale}/print/athlete-card/{id}` (كان المسار مفقودًا ويُرجع 404) |

> ملاحظة تشغيل: `npm run build` يجب أن يُنفَّذ بـ `NODE_ENV=production`. كان `.env`
> (و`.env.example`) يثبّت `NODE_ENV=development`، ما يجعل البناء يحمّل React بنسخة
> التطوير وينهار عند التمهير المسبق لمسارات Next المدمجة (`_not-found`/`_error`).
> أُزيل هذا الضبط من `.env.example` مع توضيح السبب. راجع docs/TESTING.md §التشغيل.

## أخطاء حقيقية اكتُشفت بالتشغيل وأُصلحت

هذه أخطاء فعلية لم تكن لتظهر بلا تشغيل/قاعدة حقيقية (بند 1 و2 و6 من حقبة Neon/PostgreSQL
وقد زالت أعلامها بالانتقال إلى MySQL/MariaDB؛ البنود 8–14 هي ما كشفه تشغيل 2026-10-11 على
MariaDB المحلية):

1. **قفل استشاري — تداخل توقيع (تاريخي)**: `pg_advisory_xact_lock(7002, ${fiscalYear})` كان يُرسِل
   المعامَل كـ `bigint` فلا يوجد تداخل `(integer, bigint)` في Postgres ⇒ خطأ 42883.
   أُصلح بجبر النوع، ثم **أُزيلت الأقفال الاستشارية أصلًا** مع الانتقال إلى MySQL:
   البديل الحالي جدول `app_locks` + `INSERT IGNORE` + `SELECT ... FOR UPDATE` عبر
   `lockNamed()` في `src/shared/db/client.ts` (payments:7002، receipts:7001).
2. **قيمة الإرجاع `void` (تاريخي)**: دوال القفل الاستشاري تُرجع `void` وعجز Prisma عن إزالة
   تحويل العمود ⇒ فشل. أُصلح مؤقتًا بتحويلها لاستعلام يُرجع عددًا؛ لم يعد له وجود
   بعد استبدال القفل الاستشاري بـ `app_locks`.
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

أخطاء 2026-10-11 — ظهرت فقط لأن السلسلة شُغِّلت فعلًا على MariaDB المحلية:

8. **رفض كل قراءة من التخزين على Windows**: `src/shared/storage/index.ts` كان يقارن
   `STORAGE_LOCAL_DIR` النسبي بـ `path.resolve(...)` لنفس القيمة، فكل `readFile()` كان يرمي
   403 «مسار غير صالح» — أي أن معاينة الاستيراد وملف الأخطاء وأي تسليم ملف كان يتعطل بصمت.
   الآن `resolveStoragePath()` يوحّل المسار الأساس إلى مطلق ويفحص بادئة `base + sep`، مع بقاء
   رفض `..` والمفاتيح المطلقة.
9. **صفوف استيراد صالحة تُفشل الدفعة كلها**: في `src/modules/imports/entities.ts` كانت الخلايا
   الفارغة تبقى نصًّا فارغًا، فصفّان بلا `registrationNo` يُدرَجان بـ `''` ويتصادمان على القيد
   الفريد فتسقط المعاملة (0 صفوف مُدخَلة من ملف كل صفوفه صالحة). تُزال الفراغات قبل التحقق.
10. **أسباب رفض ناقصة في الاستيراد**: `src/modules/imports/service.ts` كان يفحص النشاط المجهول
    فقط على الصفوف التي اجتازت التحقق المخطط، فلا تظهر رسالة "نشاط غير مسجّل" لصف مرفوض
    لسبب آخر. يقرأ العمود الخام الآن فتُبلَّغ كل الأنشطة المجهولة ويُرفض الصف، ويُحل `sportId`
    من الاسم العربي المُوحَّد.
11. **الاستعادة كانت تفشل دائمًا عند `markRestored`**: استيراد mysqldump يستبدل جدول
    `backup_records` بلقطته المأخوذة **قبل** إدراج صفّ تلك النسخة، فيختفي السجل المستعاد منه.
    `src/modules/backups/service.ts` + `repository.ts` أعادا إنشاء السجلَّين بعد نجاح الاستيراد
    (`upsertRecord`: النسخة المُستعاد منها + نسخة الأمان قبلها)، والاحتفاظ صار يحذف السجلات
    التي لم يعد لها ملف على القرص، ومسار الفشل يعيد ضبط `system.maintenanceMode = true`
    (لأن الاستيراد يمسح جدول الإعدادات — كانت الرسالة السابقة تدّعي بقاء الصيانة مفعّلة
    بينما هي قد مُسحت).
12. **E2E كان يُحبط بسبب البيئة**: `playwright.config.ts` لم يكن يحمّل `.env`، فـ
    `SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD` كانا فارغين و5 اختبارات تتوقف بخطأ إعداد. يستورد
    الآن `./scripts/load-env` (وعمال Playwright يرثونه)، و`tests/e2e/helpers.ts` يوثّق أن
    `SEED_ADMIN_*` لازم في `.env` أو الصدفة.
13. **ادّعاء ترويسة غير مُرسلة**: `tests/e2e/30-security.spec.ts` كان يتحقق من
    `Content-Security-Policy: default-src 'self'` التي حذفها المشروع قصداً (local-first).
    يتحقق الآن مما يُرسل فعلًا: `X-Frame-Options: DENY`، `X-Content-Type-Options: nosniff`،
    `Referrer-Policy` — مع تعليق عربي أن CSP مُعطّلة عمدًا.
14. **مسار طباعة مفقود**: `/{locale}/print/athlete-card/[id]` كان يُرجع 404؛ أُضيف وعملت منه
    البطاقة في المتصفح ببيانات حقيقية.

## المراحل (Phases 0–12)

| المرحلة | الوصف | حالة الكود | التحقق التشغيلي |
|---------|-------|------------|-----------------|
| 0 | الأساس: هيكل المستودع، tsconfig (strict)، Tailwind+RTL، ESLint/Prettier، vitest/playwright، .env.example | ✅ | ✅ typecheck + lint + unit + بناء إنتاجي على MariaDB (2026-10-11) |
| 1 | مخطط القاعدة: `schema.prisma` + `raw-constraints.sql` | ✅ | ✅ `prisma db push` + `mysql ... < prisma/raw-constraints.sql` على MariaDB المحلية |
| 2 | الطبقة المشتركة `src/shared/*` | ✅ | ✅ مغطاة باختبارات الوحدة (180)؛ قراءة التخزين عبر `resolveStoragePath()` مُجرَّبة فعليًا (كانت معطلة على Windows) |
| 3 | المصادقة/التفويض: login/logout/change-password، brute-force، جلسات DB، requirePermission، TOTP | ✅ | ✅ الدخول عبر المتصفح على `localhost:3000` يعمل ويُظهر اللوحة ببيانات حقيقية؛ E2E: 401/403/ترويسات — **أُعيدت على MariaDB (2026-10-11)**؛ TOTP مُغطّى باختبار وحدة (لم يُجرَّب بمصادقة ثنائية حية عبر UI)؛ عتبات قفل brute-force: لم تُختبر آليًا |
| 4 | الكيانات: sports/age-categories/venues/coaches/parents/athletes/groups | ✅ | ✅ seed:demo على MariaDB + unit (180)؛ E2E إنشاء مستخدم/صلاحية أعيدت على MariaDB؛ بطاقة طباعة الرياضي مُجرَّبة في المتصفح |
| 5 | الجدولة والحضور: sessions (تكرار + كشف تعارض في طبقة التطبيق)، attendance، scan | ✅ | ✅ seed يُنشئ حصصًا على MariaDB؛ اختبار التكرار يمرّ (unit). تعارض الحصص **لم يعد قيد EXCLUDE في القاعدة** — يُرفض في `src/modules/sessions/recurrence.ts` + `FOR UPDATE`. التزامن العالي تحت ضغط متوازٍ: لم يُقَس صراحة |
| 6 | الماليات: subscription-types/subscriptions/payments/receipts/expenses/cash | ✅ | ✅ seed:demo على MariaDB يُنشئ دفعات/إيصالات/خزينة؛ unit؛ E2E دورة مالية كاملة — **أُعيدت على MariaDB (2026-10-11)** |
| 7 | التقارير واللوحة: 14 نوعًا + export CSV/Excel، dashboard | ✅ | ✅ اللوحة تعرض بيانات حقيقية على `localhost:3000` (MariaDB)؛ E2E report+CSV export أعيدت على MariaDB. XLSX/باقي الأنواع: لم تُجتَر كلها |
| 8 | المستندات/الإشعارات/الاستيراد | ✅ | ✅ الاستيراد مُتحقَّق منه تشغيليًا: معالج الواجهة عبر E2E (`40-import-ui.spec.ts`) ودورة كاملة عبر API بملف `.xlsx` (5 صفوف ← 2 مُدخَلة + ملف أخطاء). الإشعارات: تنبيهات انتهاء الاشتراك مُجرَّبة (3 أهداف + dedupe). المستندات/رفع الوثائق والقنوات الخارجية: لم تُجتَر (معطلة قصدا) |
| 9 | الإدارة/التشغيل: users/roles/settings/audit-logs/backups/jobs | ✅ | ✅ backups (`mysqldump`) وrestore (`mysql`) و`worker --once` شُغِّلت فعلًا على MariaDB (2026-10-11) وأُصلحت أعطال الاستعادة؛ audit يكتب السجل فعليًا |
| 10 | التدعيم الأمني: ترويسات، تعقيم CSV، magic bytes، fail-fast env | ✅ | ✅ E2E تحقّق الترويسات المُرسلة فعلًا (X-Frame-Options/nosniff/Referrer-Policy — **بلا CSP، مُعطّلة قصداً**) + رفض float/3 خانات + 404، على MariaDB (2026-10-11). رفض Magic Bytes: لم يُختبر |
| 11 | الواجهة (UI): layout + ui-kit + شاشات/صفحات لكل الوحدات + دخول + 2FA | ✅ | ✅ بناء إنتاجي ناجح + E2E دخان عبر 6 مقاسات على MariaDB (66/66)؛ الدخول واللوحة وبطاقة الطباعة ومعالج الاستيراد مُجرَّبة في المتصفح. التفاعلات العميقة لكل شاشة لم تُجتَر آليًا |
| 12 | الاختبارات + السكربتات + الوثائق | ✅ | ✅ unit(180) + seed/demo + E2E(66/66) + backup/restore/worker على MariaDB. **seed-load (أحمال): لم يُشغَّل** |

## ما لم يتحقق بعد (بصدق)

- **Docker/docker-compose**: لم تُبنَ الصورة (ولا `docker` في البيئة).
- **seed-load** (`scripts/seed-load.ts`): اختبار الأحمال لم يُشغَّل — لا أرقام P95 ولا
  `EXPLAIN FORMAT=JSON` على MariaDB.
- **التحقق المتزامن الثقيل** لتعارض الحصص (كشف طبقة التطبيق + `FOR UPDATE`) ودفعات متزامنة
  تحت ضغط عالٍ متوازٍ متعدد العمال على نفس الصفوف — لم يُقس صراحة (MySQL لا يطبّق EXCLUDE gist).
- **2FA عبر الواجهة**: TOTP مُغطّى باختبارات وحدة فقط؛ لم يُجرَّب تدفقه الحيّ في UI.
- **معظم تدفقات UI العميقة لكل شاشة** (إنشاء/تعديل من الشاشات نفسها) خارج دخان E2E الحالي؛
  المُجرَّب في المتصفح: الدخول، اللوحة، بطاقة طباعة الرياضي، ومعالج الاستيراد.
- **base متصفح offline-first + المزامنة السحابية**: غير منفّذة أصلًا.

(كانت البنود التالية غير مُتحقَّق منها وصارت مُتحقَّقة بالتشغيل في 2026-10-11:
`backup` و`restore` على MariaDB، `worker --once` وأمان تكرار المهام، إعادة E2E والبناء
والـ lint على MariaDB، ودورة الاستيراد عبر API والواجهة.)

**ما كشفتّه صيانة 2026-10-11 وأُصلح** (تفاصيل الأرقام في `docs/FINAL_AUDIT.md` §الإصلاحات):
`.gitignore` كان يستبعد الكود المصدري لطبقة التخزين `src/shared/storage/` من Git؛ بوابة `lint`
لم تكن تغطي `scripts/` وملف الإعداد وفيها 3 أخطاء و53 تحذيرًا؛ واختبارات E2E كانت تستهلك كلمة
مرور مدير الإنسان بسبب التغيير الإجباري — صارت تدخل بحساب `seed:demo`.

## أوامر إعادة التحقق (بيئة حقيقية)

```bash
export NODE_ENV=production            # مهم للبناء
npm install
cp .env.example .env                  # DATABASE_URL=mysql://root@localhost:3306/sports_management + الأسرار
npm run typecheck && npm run lint && npm run test   # 180 اختبارًا؛ lint يشمل كل المستودع
npx prisma db push                    # لا هجرة مولّدة في المستودع (راجع prisma/migrations/README.md)
mysql -u root sports_management < prisma/raw-constraints.sql
SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run seed   # اختياري: مدير الإنسان (تغيير إجباري عند أول دخول)
npm run seed:demo                       # حساب الاختبارات admin@demo.test + بيانات تجريبية
npm run build                           # NODE_ENV=production
npx playwright install chromium         # + headless shell — النتائج الحالية: 66/66
npx playwright test                     # لا يحتاج أسرار: الافتراضي حساب seed:demo على MariaDB (2026-10-11)
# ملاحظة: playwright.config.ts يحمّل .env لبقية المتغيرات (APP_URL مثلًا)، ويمكن تجاوز
# حساب الاختبارات بـ SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD إن أردت مديرًا آخر.
npm run backup                        # mysqldump → ملف + SHA-256 + سجل + احتفاظ GFS
npm run restore -- --list             # ثم: --id=... --reason=... --confirm=RESTORE
npm run worker -- --once              # كل job_runs بنجاح؛ التشغيل الثاني → SKIPPED
```
