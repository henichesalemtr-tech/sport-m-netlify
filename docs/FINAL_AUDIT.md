# التدقيق النهائي (FINAL_AUDIT)

> **قاعدة الأمانة:** لا ✔ إلا لسلوك شُغِّل فعلًا. المشروع يعمل على **MariaDB 10.11 المحلية**
> `sports_management` (نقل من PostgreSQL/Neon — ADR-13). **سلسلة التحقق الكاملة شُغِّلت فعلًا
> على MariaDB يوم 2026-10-11** وأُصلحت أثناءها أخطاء حقيقية لا تظهر بلا تشغيل (التفاصيل في
> `docs/PROGRESS.md`).
> **✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11):** `npm run typecheck` (0 أخطاء) ·
> `npm run lint -- --max-warnings=0` ("No ESLint warnings or errors") · `npx vitest run`
> (**180 اختبارًا / 18 ملفًا**) · `NODE_ENV=production npx next build` (exit 0) ·
> **E2E Playwright 66/66** عبر 6 مقاسات · `db push` + `raw-constraints.sql` · `seed` + `seed:demo` ·
> `npm run backup` (mysqldump + SHA-256 + سجل + احتفاظ) · `npm run restore` حتى النهاية ·
> `npm run worker -- --once` (SUCCESS ثم SKIPPED على نفس المفتاح) · تنبيهات انتهاء الاشتراك
> (3 إشعارات + dedupe) · الدخول واللوحة وبطاقة طباعة الرياضي في المتصفح · استيراد Excel/CSV
> عبر API والواجهة معًا.
> **NOT VERIFIED / لم تُشغَّل:** `npm run seed:load`، أحمال وقياسات P95 و`EXPLAIN FORMAT=JSON`،
> تدفق 2FA الحيّ عبر الواجهة (اختبارات وحدة فقط)، حماية تعارض الحصص تحت تزامن متوازٍ حقيقي
> (MySQL لا يطبّق EXCLUDE gist)، قاعدة المتصفح offline-first + المزامنة السحابية (غير منفّذة أصلًا).
> أي رقم أداء من حقبة Neon/PostgreSQL يبقى **تاريخيًا**.
> البند إمّا **"✅ مُتحقَّق تشغيليًا"** مع مخرج الأمر/الاختبار كدليل، أو **تاريخي (Neon)**،
> أو **"كود موجود (غير مُتحقَّق تشغيليًا)"**، أو **"PENDING"**. التفاصيل الكاملة ونتائج
> الأخطاء المُصلَحة في `docs/PROGRESS.md`.

ملخّص التشغيل الحالي (MariaDB محلية 10.11 — **2026-10-11**): `typecheck` 0 أخطاء ·
`lint --max-warnings=0` نظيف · `vitest` **180 اختبارًا (18 ملفًا)** · `next build` إنتاجي نجح ·
**E2E Playwright 66/66** (6 مقاسات) ضد `sports_management` المحلية ·
`db push` + `raw-constraints.sql` (قيود CHECK + جدول `app_locks`) · `seed` + `seed:demo` كاملان ·
`backup`/`restore`/`worker --once` مُنفَّذة فعليًا · دخول ولوحة وطباعة واستيراد عبر المتصفح.
ملخّص تاريخي (Neon/PostgreSQL — 2026-10-10، **عُوِّض بالكامل بالأعلى**): `build` بـ 145 مسارًا ·
E2E **60/60** · أرقام لا تصف بيئة MariaDB الحالية ولا تُقدَّم كدليل عليها.

## أ) المعمارية والكود

| ✔/الحالة | البند | الدليل |
|----------|-------|--------|
| كود موجود (غير مُتحقَّق تشغيليًا) | فصل الطبقات route→service→repository | `docs/CONVENTIONS.md` + أي وحدة في `src/modules/*` |
| ✅ مُتحقَّق تشغيليًا | غلاف API موحّد (requestId، أخطاء، pagination) — استُهلك فعليًا في E2E (أخطاء موحّدة + meta.pagination) | `src/shared/api/route.ts` + `tests/e2e/30-security.spec.ts` — أعيد تشغيلها على MariaDB (2026-10-11) |
| ✅ مُتحقَّق تشغيليًا | TypeScript strict بلا any | `npm run typecheck` = 0 أخطاء · `npm run lint -- --max-warnings=0` → "No ESLint warnings or errors" — **كلاهما على MariaDB المحلية (2026-10-11)**؛ أُزيل `any` من غلاف المسار |
| ✅ مُتحقَّق تشغيليًا | أكواد أخطاء موحّدة → HTTP (401/403/404/400/422) | E2E: UNAUTHORIZED/INSUFFICIENT_PERMISSION/NOT_FOUND/VALIDATION_ERROR/BUSINESS_RULE_VIOLATION |
| ✅ مُتحقَّق تشغيليًا | env fail-fast | `src/shared/config/env.ts` — الخادم يقلع بقيم صحيحة؛ البناء نجح |
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | البناء الناجح (`NODE_ENV=production npx next build`) | exit 0 على MariaDB المحلية مع `.env` محلي؛ كان سابقًا 145 مسارًا على Neon |

## ب) قاعدة البيانات

| الحالة | البند | الدليل |
|--------|-------|--------|
| ✅ مُتحقَّق تشغيليًا | مخطط كامل (30+ جدولًا، BigInt للمال، datetime(3) بـ UTC، soft delete، version) | `npx prisma db push` على MariaDB 10.11 — كل الجداول أُنشئت فعليًا (أكتوبر 2026)؛ كان سابقًا على Neon |
| **لم يعد موجودًا في القاعدة** | كشف تعارض الحصص (مدرب/قاعة/مجموعة) | كان "✅ EXCLUDE gist × 3" على Neon/PostgreSQL. **MySQL لا يطبّق `EXCLUDE USING gist`** — لم يعد هناك قيد DB؛ المنطق في `src/modules/sessions/recurrence.ts` + `service.ts` داخل معاملة (409 SESSION_CONFLICT). منطق التكرار مغطى باختبارات وحدة، **والضمان تحت التزامن متوازٍ: NOT VERIFIED** |
| **لم يعد موجودًا في القاعدة** | فهارس فريدة جزئية `WHERE deleted_at IS NULL` | كانت على PostgreSQL؛ MySQL لا يعرفها ⇒ تفرّد وعي بالحذف الناعم تُفحصه الخدمة (`findByName`/`findByEmail`…) مع قيد `@unique` كامل |
| ✅ مُتحقَّق تشغيليًا | جدول `app_locks` (بديل الأقفال الاستشارية) | `prisma/raw-constraints.sql` طُبِّق على MariaDB عبر `mysql`؛ الجداول أُنشئت |
| ✅ مُتحقَّق تشغيليًا | CHECK مالية/منطقية | طُبِّقت على MariaDB؛ seed:demo يلتزم بها |
| موثق — تنفيذ يدوي | REVOKE UPDATE/DELETE على audit_logs | لم يعد يُطبَّق بسكربت psql؛ الحماية الحالية غياب مسارات UPDATE/DELETE في `src/modules/audit-logs` (يتطلب دور SQL منفصلًا يدويًا لعزل إضافي) |
| ✅ مُتحقَّق تشغيليًا | تخطيط Prisma المطبَّق | عبر `db push` على MariaDB (لا هجرة SQL مولّدة — انظر migrations/README) |

## ج) الأمان

| الحالة | البند | الدليل |
|--------|-------|--------|
| ✅ مُتحقَّق تشغيليًا | Argon2id (تجزئة/تحقق كلمة المرور) | seed/E2E login ناجح؛ تغيير كلمة المرور الإجباري مُجرَّب |
| ✅ مُتحقَّق تشغيليًا | جلسات DB (تجزئة رمز، idle+absolute، إبطال) | E2E: 401 بدون جلسة؛ الجلسة تعمل عبر كل نقاط API |
| كود موجود (غير مُتحقَّق تشغيليًا) | قفل brute-force (5/15د) | `auth/service.ts` — لم تُختبر العتبات آليًا |
| ✅ مُتحقَّق وحدويًا | TOTP — تشفير/تحقق (otplib، سر AES-256-GCM) | `src/shared/auth/totp.test.ts` (5 اختبارات). **لم يُجرَّب تدفق 2FA حيّ عبر UI**؛ عمود `totp_secret` موجود عبر db push |
| ✅ مُتحقَّق تشغيليًا | requirePermission في route — يُطبَّق خُدميًّا | E2E: VIEWER ← 403 على users/expenses رغم نجاح نفس النقطة للمدير |
| كود موجود (غير مُتحقَّق) | LAST_SUPER_ADMIN | `users/service.ts` — لم يُختبر آليًا |
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | قراءة/تنزيل ملفات التخزين + حارس path traversal | `resolveStoragePath()` في `src/shared/storage/index.ts` (يقبل المفاتيح النسبية ويرفض `..` والمسارات المطلقة) — مُجرَّب فعليًا برفع CSV/XLSX في الاستيراد وتنزيل ملف الأخطاء عبر E2E وAPI. أُصلح عطل كان يرفض كل `readFile()` على Windows (PROGRESS) |
| كود موجود (غير مُتحقَّق) | رفض Magic Bytes للوثائق (jpeg/png/webp/pdf) | `shared/storage` — لا رفع وثائق في E2E الحالي (الرفع المُجرَّب هو ملفات الاستيراد) |
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | ترويسات أمان فعلية (بلا CSP قصداً) | E2E `30-security.spec.ts`: `X-Frame-Options: DENY`، `X-Content-Type-Options: nosniff`، `Referrer-Policy` — CSP لم تعد تُرسل في نموذج local-first (SECURITY §8) |
| ✅ مُتحقَّق تشغيليًا | المال نصٌّ عشري — رفض float/خانات زائدة | E2E: `10.555` و`10.5`→ 400 VALIDATION_ERROR، بلا تسريب stack |
| PENDING | اختبار اختراقي + npm audit + rate limiting بالوكيل | SECURITY §10 |

## د) قواعد العمل المالية

| الحالة | البند | الدليل |
|--------|-------|--------|
| ✅ مُتحقَّق تشغيليًا | BigInt minor units + تقريب الخصم | seed:emo/`payments` أنشأ دفعات فعلية؛ unit `payments.test.ts` (12) |
| ✅ مُتحقَّق تشغيليًا | ذرّية الدفعة (دفنة+خزينة+وصل+Audit في transaction) | seed:demo أنشأ 12 دفعة + وصلات + قيود خزينة فعليًا؛ أُصلحت مهلة المعاملة (PROGRESS #3) |
| ✅ مُتحقَّق تشغيليًا | وصولات gapless (قفل `app_locks` عبر `lockNamed()` + قيد unique) | seed:demo على MariaDB أصدر وصلات فعلية؛ القفل الاستشاري (`pg_advisory_xact_lock`) استُبدل بجدول `app_locks` — التزامن المتوازي على نفس السنة: لم يُقس |
| ✅ مُتحقَّق تشغيليًا | منع overpay + إعادة اشتقاق paidAmount | unit `subscriptions`/`payments`؛ سلوك في service |
| كود موجود (غير مُتحقَّق) | void/refund + REVERSAL | لم تُجرَّب عبر E2E |
| ✅ مُتحقَّق تشغيليًا | إنشاء/انتقالات الاشتراك | seed:demo أنشأ 8 اشتراكات (أحدها بخصم 10% يستلزم سببًا) |
| ✅ مُتحقَّق تشغيليًا | السعة بقفل صف | E2E إنشاء مجموعات؛ unit `capacityRules` (10) |
| ✅ مُتحقَّق تشغيليًا | دورة مالية كاملة عبر API | E2E `10-finance-cycle`: فتح خزينة→مصروف→تقرير→CSV export ناجح (بعد إصلاح تدقيق التصدير، PROGRESS #4) |
| PENDING | تزامن ثقيل متوازٍ على نفس الصفوف | لم يُقس (E2E بـ worker محدود) |

## هـ) التشغيل

| الحالة | البند | الدليل |
|--------|-------|--------|
| ✅ مُتحقَّق تشغيليًا | seed (مرجعي) | `npm run seed` على MariaDB — صلاحيات/أدوار/مرجعيات/Super Admin |
| ✅ مُتحقَّق تشغيليًا | seed-demo (يمرّ عبر طبقة الخدمات + Audit) | `npm run seed:demo` كامل على MariaDB (يرفض production كما هو موثّق) |
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | النسخ الاحتياطي اليدوي | `npm run backup` → ملف `.sql` حقيقي (242059 بايت) في `storage/backups` + checksum SHA-256 + سجل في `backup_records` + تطبيق احتفاظ GFS |
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | الاستعادة | `npm run restore -- --id=... --reason=... --confirm=RESTORE` حتى النهاية: نسخة أمان تلقائية قبل الاستعادة → `mysql < dump` → وسم `restoredAt` → عودة `system.maintenanceMode` إلى false → عدد الصفوف مطابق قبل/بعد. كان يفشل دائمًا عند `markRestored` (PROGRESS؛ أعيد بناء السجلين بعد الاستيراد) |
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | worker --once + أمان التكرار | كل المهام المجدولة SUCCESS في `job_runs` (مسح صلاحيات، إبطال جلسات منتهية، تنبيهات انتهاء اشتراك، نسخة مجدولة، recoverStaleJobs)؛ التشغيل الثاني على نفس `lock_key` → SKIPPED |
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | تنبيهات انتهاء الاشتراك + dedupe | نقل نهاية اشتراك ACTIVE إلى اليوم+3 أنتج 3 إشعارات بالضبط (RECEPTION/ADMIN/SUPER_ADMIN)؛ إعادة التشغيل → 0 إشعار جديد (`dedupeKey`) |
| كود موجود (لم يُشغَّل) | seed-load (اختبار أحمال) | `scripts/seed-load.ts` — لم يُنفَّذ؛ لا أرقام P95/`EXPLAIN FORMAT=JSON` على MariaDB |
| كود موجود (لم تُبنَ) | Dockerfile + compose | `docker/` — لم تُبنَ |
| ✅ مُتحقَّق تشغيليًا | تقارير (قائمة + تصدير CSV) | E2E تقرير المصروفات + تصدير CSV (content-type csv) — أعيد على MariaDB (2026-10-11) |
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | استيراد CSV/Excel بخطوات (API + معالج الواجهة) | ملف `.xlsx` بـ 5 صفوف: رفع 200 → اكتشاف 12 حقلًا تلقائيًا → معاينة 5 إجمالي / 2 صالح / 2 مرفوض / 1 مكرر → اعتماد: إدخال صفيَّين مع `sportId` من الاسم العربي وحقول جهة الاتصال الطارئة وأرقام تسجيل تلقائية (ATH-2026-00010/00011) + ملف أخطاء بكل الأسباب. E2E: `tests/e2e/40-import-ui.spec.ts` |
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | شاشة طباعة بطاقة الرياضي | `/{locale}/print/athlete-card/[id]` مُجرَّبة في المتصفح — كان المسار مفقودًا ويُرجع 404 قبل الإضافة |

## و) الجودة والوثائق

| الحالة | البند | الدليل |
|--------|-------|--------|
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | اختبارات الوحدة النقية | `npx vitest run` → **180 اختبارًا / 18 ملفًا** (0 فشل)، منها ملف جديد `src/modules/imports/imports.test.ts` (9 اختبارات): تفريغ الخلايا الفارغة، رفض تاريخ DD/MM/YYYY، توحيد الجنس (ذكر/أنثى/Female/M)، مفتاح الهوية المكرر، عدد رؤوس القالب، وأن `registrationNo` فارغًا لم يعد يُدرَج |
| ✅ مُتحقَّق تشغيليًا (MariaDB، 2026-10-11) | E2E Playwright | `npx playwright test` → **66/66** عبر 6 مشاريع مقاسات (desktop/tablet/320/375/390/430) ضد قاعدة `sports_management` المحلية — عوّضت أرقام Neon (60/60) التاريخية |
| PENDING | coverage بأرقام حقيقية + قياسات P95/`ANALYZE FORMAT=JSON` | لم تُشغَّل |

## ز) النواقص المعلَنة (لا تُخفى)

1. **الواجهة**: اكتملت وبُنيت إنتاجيًا ودُخِّنت عبر E2E على MariaDB (دخول + توجيه + حقول +
   ترويسات + 6 مقاسات + معالج الاستيراد + بطاقة طباعة الرياضي). **التفاعلات العميقة لكل
   شاشة** (إنشاء/تعديل من الواجهة نفسها لبقية الشاشات) لم تُجتَر آليًا — السلاسل الحرجة
   مُغطّاة عبر API في E2E.
2. **TOTP**: مُنفَّذ ومُغطّى باختبار وحدة؛ **تدفق 2FA الحيّ عبر الواجهة** لم يُختبر.
3. **الهجرة Prisma**: طُبِّق المخطط عبر `db push` على MariaDB؛ لم تُولَّد ملفات `migrations/` SQL.
4. **backups/restore/worker**: شُغِّلت فعلًا على MariaDB (2026-10-11) وأُصلحت أعطال فيها.
   **بقي: `seed:load` (أحمال) وDocker — لم تُشغَّل/لم تُبنَ.**
5. **التزامن الثقيل** (كشف تعارض الحصص في طبقة التطبيق وتداخل الدفعات تحت ضغط متوازٍ
   متعدد العمال على نفس الصفوف): لم يُقس — ولا يوجد قيد DB احتياطي للتعارض بعد انتقال
   المشروع إلى MySQL.
6. **خط التحقق (lint/typecheck/test/build/E2E) على MariaDB**: نُفِّذ بالكامل في 2026-10-11
   (النتائج في `docs/TESTING.md` §5.5 و`docs/PROGRESS.md`).
7. **offline-first + المزامنة السحابية**: غير منفّذة أصلًا (لا قاعدة متصفح ولا مزامنة) —
   لا تُذكر كمُتحقَّق منها.
8. **أي رقم أداء من حقبة Neon/PostgreSQL**: تاريخي ولا يصف بيئة MariaDB الحالية.

## ح) أخطاء حقيقية لم تظهر إلا بالتشغيل (2026-10-11) — مُصلَحة

1. `src/shared/storage/index.ts`: حارس path traversal كان يقارن `STORAGE_LOCAL_DIR` النسبي
   بـ `path.resolve(...)`، فعلى Windows كان **كل** `readFile()` يرمي 403 «مسار غير صالح» —
   ما كان يُسقط معاينة الاستيراد وملف الأخطاء وأي تسليم ملف من التخزين. البديل:
   `resolveStoragePath()` يوحّل المسار الأساس إلى مطلق ويفحص البادئة `base + sep`
   (ولا يزال يرفض `..` والمفاتيح المطلقة).
2. `src/modules/imports/entities.ts`: الخلايا الفارغة كانت تبقى نصوصًا فارغة، فصفّان بلا
   `registrationNo` كانا يُدرَجان بـ `''` ويتصادمان على القيد الفريد فتفشل المعاملة كلها
   (0 صفوف من ملف كل صفوفه صالحة). تُزال الفراغات الآن قبل التحقق.
3. `src/modules/imports/service.ts`: كشف النشاط غير المسجّل كان يعمل على الصفوف التي اجتازت
   التحقق المخطط، فلا يُبلَّغ عن نشاط مجهول في صف مرفوض لسبب آخر. يقرأ الآن العمود الخام،
   فتُبلَّغ كل الأنشطة المجهولة ويُرفض الصف؛ و`sportId` يُحل من الاسم العربي المُوحَّد.
4. `src/modules/backups/service.ts` + `repository.ts`: `restore()` كان يفشل دائمًا عند
   `markRestored`، لأن استيراد mysqldump يستبدل جدول `backup_records` بلقطته المسحوبة قبل
   إدراج صفّ تلك النسخة. يُعاد الآن إنشاء السجلَّين (`upsertRecord`: النسخة المُستعاد منها
   ونسخة الأمان قبل الاستعادة)، والاحتفاظ يحذف السجلات التي فقدت ملفها، ومسار الفشل يعيد
   ضبط `system.maintenanceMode = true` لأن الاستيراد يمسح جدول الإعدادات.
5. `playwright.config.ts`: Playwright لم يكن يحمّل `.env`، فكان `SEED_ADMIN_EMAIL/PASSWORD`
   فارغين ويُحبط 5 اختبارات E2E بخطأ إعداد. يستورد الآن `./scripts/load-env` (ويرثه العمال).
6. `tests/e2e/30-security.spec.ts`: كان يتحقق من ترويسة `Content-Security-Policy: default-src 'self'`
   التي لم يعد المشروع يرسلها. يتحقق الآن من الترويسات المُرسلة فعلًا (X-Frame-Options DENY،
   X-Content-Type-Options nosniff، Referrer-Policy).
7. `.gitignore`: النمط `storage/` (بلا شرطة جذر) كان يتطابق مع `src/shared/storage/` أيضًا،
   فبقي **كود طبقة التخزين كلُّه خارج Git ولم يُلتقط قطّ** — استنساخ نظيف للمستودع لا يُبنى.
   أُصلح إلى `/storage/` (مجلد البيانات في الجذر فقط). لا يُعرف متى كُسر؛ اكتُشف بفحص
   `git ls-files --others --ignored` أثناء صيانة 2026-10-11.
8. بوابة Lint: `npm run lint` كان يشغّل `next lint` وحده (يغطي `src` فقط). فحص المستودع كاملًا
   `npx eslint .` أظهر **3 أخطاء و53 تحذيرًا**: `require` في `next.config.js`، ومتغير محلي
   باسم `module` في `scripts/seed.ts` (يحجب الاسم العام ويخالف قاعدة Next)، و`sessionsCount`
   في `scripts/seed-demo.ts` يُزاد ولا يُقرأ أبدًا. صارت البوابة `next lint && eslint . --max-warnings=0`،
   مع استثناءَين موثَّقَين في `.eslintrc.json`: `no-console` مطفأ في `scripts/**` (مخرجات
   سطر الأوامر هي عملها) و`no-var-requires` مطفأ في `*.config.js` (Next يقرأه CommonJS).
9. اقتران اختبارات E2E بحساب المدير الحقيقي: كان `tests/e2e/helpers.ts` يفرض
   `SEED_ADMIN_EMAIL/PASSWORD`، وبما أن حساب `npm run seed` يُولَّد بـ `mustChangePassword=true`
   فإن أول تشغيل يغيّر كلمة مرور المدير الذي يدخل منه الإنسان — فتتعطل وثائق README ويُحبط
   المستخدم المحلي. صار الافتراضي حساب `seed:demo` (`admin@demo.test`) وثابتاه منشوران في
   المستودع أصلًا، و`adminSession` تُرجع الكلمة الصالحة فعليًا ليستخدمها تسجيل الدخول من
   المتصفح (`tests/e2e/40-import-ui.spec.ts`) بدل افتراض `E2E_PASSWORD`. حساب `seed` المرجعي
   لم تعد الاختبارات تمسّه. نتيجة التشغيل بعد الإصلاح: `npx playwright test` ✅ 66/66 (2026-10-11).

## ط) صيانة 2026-10-12: MySQL 8.4 إدارية بعيدة (Aiven) + تجهيز Netlify

### عيبا محمولية حقيقيان لم يظهرا إلا على MySQL 8.4 بعيدة (مُصلَحة، بالتشغيل)

1. **`Invalid default value for 'registration_date'`** عند `prisma db push`: العمودان
   `Athlete.registrationDate` و`GroupMember.joinedAt` كانا `DateTime @db.Date @default(now())`.
   MariaDB 10.11 يتسامح مع الافتراضي الزمني على نوع `DATE`، وMySQL 8.4 يرفضه رفضًا صريحًا.
   الصيغة العاملة على المحرّكين: `@default(dbgenerated("(CURRENT_DATE)"))` — تحقّق بإعادة
   `db push` على Aiven (38 جدولًا) ثم على MariaDB المحلية (612ms) بلا أخطاء.
2. **اتصال غير مُشفَّر بصمت**: `?ssl-mode=REQUIRED` (صيغة JDBC/mysql:// التي يوثّقها Aiven)
   **لا تُقرأ** من Prisma 5.22؛ الدليل تشغيلي لا نظري — `SHOW SESSION STATUS LIKE 'Ssl_%'`
   أعطى `Ssl_cipher`/`Ssl_version` فارغَين مع `ssl-mode=REQUIRED` و`sslmode=require` و`tls=true`
   وبلا وسائط، وأعطت `TLSv1.2 / ECDHE-RSA-AES256-GCM-SHA384` مع `?sslaccept=accept_invalid_certs`.
   كما أن `sslmode=verify-full` يُتجاهل (لا تحقق من هوية الشهادة بلا ملف CA الخاص بـ Aiven).
   النتيجة موثّقة في `.env.example` و`netlify.toml` وRUNBOOK §0.5 وADR-17؛ السلسلة المعتمدة:
   `...?sslaccept=accept_invalid_certs&connection_limit=8`.

### فروق بيئية رصدت أثناء التحقق (لا أخطاء تطبيق)

- MySQL 8.4 أزالت متغيّر `@@have_ssl` (البديل `@@require_secure_transport`، وكان `0`: الاتصال
  المشفَّر مسموح لا مفروض، فالإلزام على عهدة سلسلة الوصل لا الخادم)، و`CHECK_CONSTRAINTS`
  لا يملك عمود `TABLE_NAME` (البديل `TABLE_CONSTRAINTS WHERE CONSTRAINT_TYPE='CHECK'`).
- الترتيب الافتراضي `utf8mb4_0900_ai_ci` و`sql_mode` يشمل `ANSI_QUOTES` و`ONLY_FULL_GROUP_BY`
  و`PIPES_AS_CONCAT` و`STRICT_ALL_TABLES`؛ لم يُلاحظ انحراف سلوك بعد تطبيق القيود والزرع
  والدخان التطبيقي وE2E (11/11 سطح مكتب) ضد هذه القاعدة.
- خطأ تسلسلي: `BigInt` غير قابل لـ JSON في سكربت فحص مؤقت (عولج بتحويل `Number`)، وتمرير
  `datasources: [{name,url}]` في Prisma كان **يطبع سلسلة الوصل الحاملة للاعتماديات** في رسالة
  الخطأ — البديل `{ db: { url } }`، مع إخفاء `mysql://…` من كل مخرجات الفحص.

### ما بقي غير مُتحقَّق منه في هذا المسار (بصدق)

- **النشر الفعلي على Netlify**: البناء على منصّات Netlify لم يُشغَّل، والرابط الحيّ لم يُفتح؛
  المتغيّرات السرّية الأربعة وأمر رفع المستودع بيد المالك. لذا لم تُختبر الدالة المجدولة
  على موقع منشور، ولا سلوك `/tmp` كوعاء تخزين/نسخ داخل الدوال.
- **نقل الاعتماديات**: إخراج `@prisma/client` و`argon2` من حزمة الدوال مضبوط في
  `next.config.js` ومقبول نوعيًا ومحليًا، لكن صحّة ربطه على Linux الخاص بـ Netlify لم تُجرَّب.
- النسخ الاحتياطي على المنصّة مُعطّل قصداً (`BACKUP_JOB_ENABLED=false`)؛ التحقّق التشغيلي
  الوحيد هو مسار `SKIPPED` نفسه (503/401/200 + `backup: SKIPPED`)، لا نسخة حقيقية من الموقع.
