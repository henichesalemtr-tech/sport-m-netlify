# دليل التشغيل (RUNBOOK)

> **حالة التحقق:** الإجراءات أدناه **شُغِّلت فعلًا على MariaDB 10.11 المحلية**
> `sports_management` في 2026-10-11: `npm run backup` (mysqldump → ملف `.sql` بحجم 242059 بايت
> + SHA-256 + سجل + احتفاظ GFS)،
> `npm run restore -- --id=... --reason=... --confirm=RESTORE` (نسخة أمان تلقائية ← استيراد
> `mysql` ← `restoredAt` ← خروج من وضع الصيانة ← عدد الصفوف مطابق قبل/بعد)،
> و`npm run worker -- --once` (كل المهام SUCCESS، والتشغيل الثاني SKIPPED على نفس المفتاح).
> **ما لم يُشغَّل بعد:** `seed:load` (أحمال) وDocker — وجرّب أي إجراء على بيئة تطوير أولًا.
> ملاحظة الاستعادة المهمة في §2 (جداول الإعدادات والسجلات التي يستبدلها الملف المستعاد).

## 0) الإقلاع وأول دخول (بيئة محلية: MariaDB/XAMPP)

```bash
npm install
cp .env.example .env            # DATABASE_URL + APP_SECRET/SESSION_SECRET (32 حرفًا على الأقل)
mysql -u root -e "CREATE DATABASE IF NOT EXISTS sports_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npx prisma db push
mysql -u root sports_management < prisma/raw-constraints.sql
npm run seed                    # مرجعيات (صلاحيات/أدوار/إعدادات) — بلا مستخدم إلا بضبط SEED_ADMIN_*
npm run seed:demo               # حساب admin@demo.test + بيانات تجريبية (للتطوير فقط)
npm run dev                     # http://localhost:3000
npm run test:e2e                # لا يحتاج أسرار: يستخدم حساب seed:demo (ADR-16)
```

- **الدخول:** `admin@demo.test` بكلمة `Demo@12345` (ثابتان منشوران في `scripts/seed-demo.ts`).
  حساب `npm run seed` (عند ضبط `SEED_ADMIN_*`) يولد بـ **تغيير إلزامي لكلمة المرور عند أول دخول**.
- **حدود هذا النموذج:** بلا CSP/HSTS والكوكي `secure` فقط تحت `https://` — الوصول مفترض محلي/داخلي
  (انظر SECURITY.md §8 وADR-15). لا تفتح المنفذ على الإنترنت قبل إضافة CSP بـ nonces وتفعيل TOTP.

## 1) المهام المجدولة (Worker/Cron)

- **التشغيل المستمر:** `npm run worker` (حلقة كل `WORKER_INTERVAL_MINUTES`، افتراضي 15).
  في Docker: خدمة `worker` في docker-compose.
- **عبر cron/systemd timer:** `npm run worker -- --once` — كل دورة تسترد أولًا المهام
  المنقطعة (`recoverStaleJobs` — RUNNING أقدم من 60 دقيقة ⇒ FAILED وتحرير القفل).
- **المهام:** `expire-subscriptions` (تعليم المنتهي EXPIRED)، `generate-notifications`
  (تنبيهات انتهاء الاشتراك/الغياب المتتابع/الوثائق… — dedupe_key يمنع التكرار)،
  `expiring-documents`، `backup` (نسخة GFS يومية/أسبوعية/شهرية + احتفاظ)،
  `reconcile` (تسوية paidAmount/الخزينة).
- **أمان التكرار:** كل مهمة تُقفل بـ `JobRun.lockKey` فريد — ✅ **مُتحقَّق تشغيليًا (MariaDB،
  2026-10-11):** `npm run worker -- --once` أنجز كل المهام بحالة SUCCESS في `job_runs`
  (مسح الصلاحيات، إبطال الجلسات المنتهية، تنبيهات انتهاء الاشتراك، النسخة المجدولة،
  recoverStaleJobs)، وإعادة التشغيل في نفس النافذة أعطت SKIPPED على نفس `lock_key`.
  راقب `job_runs` بحثًا عن FAILED.
- **تنبيهات انتهاء الاشتراك (✅ مُتحقَّق تشغيليًا 2026-10-11):** تقديم تاريخ نهاية اشتراك ACTIVE
  إلى اليوم+3 أنتج 3 إشعارات بالضبط (RECEPTION / ADMIN / SUPER_ADMIN)، وإعادة تشغيل worker
  أنتجت 0 إشعار جديد — `dedupeKey` يمنع التكرار.
- **تشخيص:** `mysql -u root sports_management -e "SELECT job_name,status,started_at,error FROM job_runs ORDER BY started_at DESC LIMIT 20;"`

## 2) النسخ الاحتياطي

### إنشاء نسخة

```bash
npm run backup                    # يدوي (manual)
npm run backup -- --kind=auto     # daily|weekly|monthly حسب تاريخ اليوم (GFS)
```

أو من الواجهة (صلاحية `backup.manage`). كل نسخة: `mysqldump` → ملف في
`BACKUP_DIR` → سجل `backup_records` (حجم + SHA-256) → Audit → تطبيق الاحتفاظ
(يومي 7 / أسبوعي 4 / شهري 6 — `BACKUP_RETENTION_*`).
✅ **مُتحقَّق تشغيليًا (MariaDB، 2026-10-11):** `npm run backup` أنتج ملف `.sql` فعليًا بحجم
242059 بايت في `storage/backups` مع checksum SHA-256 وصفّ في `backup_records` وتطبيق احتفاظ GFS.

### الاستعادة

```bash
npm run restore -- --list
npm run restore -- --id=<uuid> --reason="سبب مفصل 10 أحرف على الأقل"
# أو: --file=backup-daily-....sql
# يؤكد تفاعليًا بكتابة RESTORE حرفيًا (أو --confirm=RESTORE للأتمتة)
```

تسلسل الاستعادة (backupService.restore): نسخة أمان تلقائية **قبل** الاستعادة →
تفعيل وضع الصيانة (`system.maintenanceMode`) → `mysql < الملف` (mysqldump يتضمن DROP TABLE) →
إعادة بناء سجلَّي النسخ → Audit + `restoredAt` → إطفاء وضع الصيانة عند النجاح.
✅ **مُتحقَّق تشغيليًا (MariaDB، 2026-10-11):** استعادة كاملة حتى النهاية — نسخة الأمان
التلقائية، استيراد `mysql < dump`، وسم `restoredAt` على النسخة المُستعاد منها، عودة
`system.maintenanceMode` إلى false، وبقاء بيانات التطبيق سليمة (عدد الصفوف قبل/بعد متطابق).

**ما يجب معرفته عن الاستعادة (لأن `mysql < dump` يستبدل الجداول):**
- الاستيراد يعيد جدولَ **`settings`** و**`backup_records`** كما كانا لحظة الالتقاط، فتختفي
  منهما صفوف لحظية (منها صفّ النسخة المُستعاد منها وصفّ نسخة الأمان، وراية الصيانة نفسها).
  لذلك يعيد التطبيق بعد نجاح الاستيراد بناء الصفَّين في `backup_records` عبر `upsertRecord`
  (في `src/modules/backups/service.ts` + `repository.ts`)، ويضبط `system.maintenanceMode = false`.
- السجلات المستعادة التي **لا ملف لها على القرص** (نسخ قديمة التُقطت قبل ملفات حُذفت) تظهر
  في القائمة برابط تنزيل ميت؛ تشغيل الاحتفاظ التالي يحذفها تلقائيًا (تتوسّع `enforceRetention`
  إلى ما وراء سياسة GFS).
- **عند فشل الاستعادة يبقى وضع الصيانة مفعّلًا عمدًا** (حماية للكتابة فوق قاعدة نصف مستعادة) —
  يضبطها التطبيق صراحةً على `true` في مسار الفشل لأن الاستيراد يكون قد مسح جدول الإعدادات.
  بعد المعالجة والتأكد من سلامة البيانات أطفئها من **الإعدادات** في الواجهة
  (`system.maintenanceMode`) أو `PUT /api/v1/settings/system.maintenanceMode {value:false}`
  (صلاحية `settings.manage`).

### التحقق الدوري من النسخ (موصى به شهريًا)

```bash
sha256sum storage/backups/<file>.sql      # قارنه بعمود checksum
head -50 storage/backups/<file>.sql         # تحقق أن الملف يبدأ بتعليق mysqldump
# واستعادة تجريبية على قاعدة مؤقتة:
mysql -u root -e "CREATE DATABASE sms_restore_test CHARACTER SET utf8mb4" &&
mysql -u root sms_restore_test < <file>.sql   # استعادة على قاعدة اختبار قبل الأساسية
```

### النسخ خارج الخادم

`BACKUP_DIR` مجلد محلي — انسخه (أو ركّبه volume) إلى تخزين خارجي/خادم آخر؛
وجود النسخ على نفس القرص لا يحمي من فقدان العتاد.

## 3) الاستجابة للحوادث (Incident Response)

1. **اشتباه اختراق حساب:** `GET /users/[id]/sessions` ثم `DELETE` لإبطال كل الجلسات
   فورًا (تجزئة الرموز في DB ⇒ الإبطال فوري) → إعادة ضبط كلمة المرور
   (`/users/[id]/reset-password`) → راجع audit_logs (LOGIN/LOGIN_FAILED + الطلبات).
2. **تعديل/حذف مالي خاطئ:** لا تُصلح يدويًا في القاعدة — استخدم المسارات النظامية:
   `payments/[id]/void` (يعيد الاشتقاق + قيد REVERSAL) أو `refund`، والمصاريف
   `expenses/[id]/void`. راجع `docs/BUSINESS_RULES.md`.
3. **تلف بيانات/استعادة:** اتبع §2 (الاستعادة) — وضع الصيانة يحمي من الكتابة
   أثناء العملية.
4. **فشل مهمة مجدولة:** افحص `job_runs.error` → أصلح السبب → `npm run worker -- --once`
   (الأقفال يومية: إن فشل نفس المفتاح، حرّر القفل يدويًا فقط إن بقي RUNNING عالقًا:
   recoverStaleJobs يعالجه تلقائيًا بعد 60 دقيقة).
5. **امتلاء القرص:** راجع حجم `storage/backups` (الاحتفاظ تلقائي) و`storage/private`.
6. **قفل حسابات جماعي (هجوم تخمين):** `locked_until` يُفك تلقائيًا بعد
   `LOGIN_LOCKOUT_MINUTES`؛ للهجمات المستمرة أضف rate limiting في nginx
   (`limit_req`) — غير منفذ داخل التطبيق بعد (SECURITY §10).
7. بعد أي حادث: صدّر سجل audit_logs ذي الصلة (`/audit-logs` — audit.view) واحفظه
   خارج القاعدة كدليل.

## 4) أعطال شائعة وحلولها

| العَرَض | السبب المرجح | المعالجة |
|---------|--------------|----------|
| "إعداد البيئة غير صالح — تعذّر بدء التشغيل" | APP_SECRET/SESSION_SECRET/DATABASE_URL ناقصة أو ليست 64 hex | راجع .env (Zod fail-fast يعرض الحقول الناقصة) |
| نسخة احتياطية تفشل: "أداة mysqldump غير متوفرة" | أدوات MySQL خارج PATH | أضِف `C:\xampp\mysql\bin` إلى PATH؛ شخّص بـ `backupService.checkToolsAvailable` (يُستخدم في backup.ts) |
| 409 SESSION_CONFLICT عند إنشاء حصة | فحص التعارض (مدرب/قاعة/مجموعة) في **طبقة التطبيق** داخل المعاملة — لا يوجد قيد EXCLUDE في MySQL (`src/modules/sessions/recurrence.ts`) | غيّر الوقت/المورد؛ راجع الحصص المتداخلة (الملغاة/المحذوفة مستثناة) — لا ضمان على مستوى القاعدة |
| 409 DUPLICATE_RECORD عند إنشاء رياضي | قيد `@unique` كامل (registration_no/بريد/هاتف) أو فحص الخدمة للتفرّد مع الحذف الناعم (لا فهارس جزئية في MySQL) | راجع سجلات duplicates |
| 403 رغم أن الدور "صحيح" | المصفوفة مخصصة (user_role_permissions) أو الكود غير مبذر | `GET /roles/[role]/permissions`؛ تأكد أن `npm run seed` نُفّذ (ينشئ أكواد view الإضافية) |
| اختبارات/استعلامات بطيئة بعد seed:load | إحصاءات المخطط قديمة | `mysql -u root sports_management -e "ANALYZE TABLE ...;"` أو `SHOW PROCESSLIST;` |
| العربية رموز غريبة في CSV | BOM مفقود عند الفتح بأداة غير Excel | استخدم export المدمج (يضيف BOM تلقائيًا) |
| worker لا يفعل شيئًا (SKIPPED دائمًا) | lock_key عالق RUNNING | انتظر recoverStaleJobs (60د) أو افحص job_runs — السلوك مُجرَّب: تشغيل ثانٍ في نفس النافذة يُرجع SKIPPED على نفس المفتاح |
| الوضع عالق على الصيانة بعد استعادة فاشلة | فشل `mysql` أثناء الاستيراد؛ التطبيق يعيد ضبط الراية على `true` عمدًا لأن الاستيراد مسح جدول الإعدادات | تحقق من السجلات، ثم أطفئ `system.maintenanceMode` يدويًا من الإعدادات بعد التأكد من سلامة البيانات |
| قائمة النسخ فيها سجلات بلا ملف (تنزيل 404) بعد استعادة نسخة قديمة | الاستيراد أعاد `backup_records` كما كان وقت الالتقاط | تشغيل الاحتفاظ التالي يحذف السجلات التي فقدت ملفها تلقائيًا (سلوك مُصحَّح في `backups/service.ts`) |

## 5) عمليات دورية مقترحة

| التكرار | العملية |
|---------|---------|
| يومي | التأكد من نجاح مهمة backup (job_runs) + وجود ملف اليوم |
| أسبوعي | مراجعة FAILED في job_runs وaudit_logs للأحداث الحساسة (VOID/REFUND/EXPORT) |
| شهري | اختبار استعادة على قاعدة مؤقتة + `npm run audit:deps` + مراجعة المستخدمين/الجلسات النشطة |
| ربع سنوي | مراجعة مصفوفة الصلاحيات المخصصة + مراجعة الإعدادات المالية (ASSUMPTIONS) |
