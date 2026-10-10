# دليل التشغيل (RUNBOOK)

> **NOT VERIFIED / لم يُتحقق منه:** إجراءات مكتوبة من قراءة الكود؛ لم تُنفَّذ
> في بيئة التوثيق (لا node/npm/docker/postgres). جرّبها أولًا على بيئة تطوير.

## 1) المهام المجدولة (Worker/Cron)

- **التشغيل المستمر:** `npm run worker` (حلقة كل `WORKER_INTERVAL_MINUTES`، افتراضي 15).
  في Docker: خدمة `worker` في docker-compose.
- **عبر cron/systemd timer:** `npm run worker -- --once` — كل دورة تسترد أولًا المهام
  المنقطعة (`recoverStaleJobs` — RUNNING أقدم من 60 دقيقة ⇒ FAILED وتحرير القفل).
- **المهام:** `expire-subscriptions` (تعليم المنتهي EXPIRED)، `generate-notifications`
  (تنبيهات انتهاء الاشتراك/الغياب المتتابع/الوثائق… — dedupe_key يمنع التكرار)،
  `expiring-documents`، `backup` (نسخة GFS يومية/أسبوعية/شهرية + احتفاظ)،
  `reconcile` (تسوية paidAmount/الخزينة).
- **أمان التكرار:** كل مهمة تُقفل بـ `JobRun.lockKey` فريد — تشغيل عاملَين معًا آمن
  (الثاني SKIPPED). راقب `job_runs` بحثًا عن FAILED.
- **تشخيص:** `psql "$DATABASE_URL" -c "SELECT job_name,status,started_at,error FROM job_runs ORDER BY started_at DESC LIMIT 20;"`

## 2) النسخ الاحتياطي

### إنشاء نسخة

```bash
npm run backup                    # يدوي (manual)
npm run backup -- --kind=auto     # daily|weekly|monthly حسب تاريخ اليوم (GFS)
```

أو من الواجهة (صلاحية `backup.manage`). كل نسخة: `pg_dump -Fc` → ملف في
`BACKUP_DIR` → سجل `backup_records` (حجم + SHA-256) → Audit → تطبيق الاحتفاظ
(يومي 7 / أسبوعي 4 / شهري 6 — `BACKUP_RETENTION_*`).

### الاستعادة

```bash
npm run restore -- --list
npm run restore -- --id=<uuid> --reason="سبب مفصل 10 أحرف على الأقل"
# أو: --file=backup-daily-....dump
# يؤكد تفاعليًا بكتابة RESTORE حرفيًا (أو --confirm=RESTORE للأتمتة)
```

تسلسل الاستعادة (backupService.restore): نسخة أمان تلقائية **قبل** الاستعادة →
تفعيل وضع الصيانة (`system.maintenanceMode`) → `pg_restore --clean --if-exists` →
Audit + `restoredAt`. **عند الفشل يبقى وضع الصيانة مفعّلًا عمدًا** — بعد المعالجة
أطفئه: `PUT /api/v1/settings/system.maintenanceMode {value:false}` (settings.manage).

### التحقق الدوري من النسخ (موصى به شهريًا)

```bash
sha256sum storage/backups/<file>.dump     # قارنه بعمود checksum
pg_restore --list storage/backups/<file>.dump | head   # قابلية القراءة
# واستعادة تجريبية على قاعدة مؤقتة:
createdb sms_restore_test && pg_restore -d postgresql://.../sms_restore_test <file>.dump
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
| نسخة احتياطية تفشل: "أداة pg_dump غير متوفرة" | PostgreSQL client tools غير مثبتة/خارج PATH | ثبّت postgresql-client؛ شخّص بـ `backupService.checkToolsAvailable` (يُستخدم في backup.ts) |
| 409 SESSION_CONFLICT عند إنشاء حصة | قيد EXCLUDE (تعارض مدرب/قاعة/مجموعة) | غيّر الوقت/المورد — القيد على مستوى القاعدة |
| 409 DUPLICATE_RECORD عند إنشاء رياضي | فهرس جزئي فريد (registration_no/بريد/هاتف) | راجع سجلات duplicates |
| 403 رغم أن الدور "صحيح" | المصفوفة مخصصة (user_role_permissions) أو الكود غير مبذر | `GET /roles/[role]/permissions`؛ تأكد أن `npm run seed` نُفّذ (ينشئ أكواد view الإضافية) |
| اختبارات/استعلامات بطيئة بعد seed:load | إحصاءات المخطط قديمة | `psql "$DATABASE_URL" -c "ANALYZE;"` |
| العربية رموز غريبة في CSV | BOM مفقود عند الفتح بأداة غير Excel | استخدم export المدمج (يضيف BOM تلقائيًا) |
| worker لا يفعل شيئًا (SKIPPED دائمًا) | lock_key عالق RUNNING | انتظر recoverStaleJobs (60د) أو افحص job_runs |
| الوضع عالق على الصيانة بعد استعادة فاشلة | فشل pg_restore mid-way | تحقق من السجلات، ثم أطفئ `system.maintenanceMode` يدويًا بعد التأكد من سلامة البيانات |

## 5) عمليات دورية مقترحة

| التكرار | العملية |
|---------|---------|
| يومي | التأكد من نجاح مهمة backup (job_runs) + وجود ملف اليوم |
| أسبوعي | مراجعة FAILED في job_runs وaudit_logs للأحداث الحساسة (VOID/REFUND/EXPORT) |
| شهري | اختبار استعادة على قاعدة مؤقتة + `npm run audit:deps` + مراجعة المستخدمين/الجلسات النشطة |
| ربع سنوي | مراجعة مصفوفة الصلاحيات المخصصة + مراجعة الإعدادات المالية (ASSUMPTIONS) |
