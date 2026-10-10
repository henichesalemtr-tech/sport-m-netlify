# توثيق API (API_DOCUMENTATION)

> **NOT VERIFIED / لم يُتحقق منه:** الجدول أدناه مستخرج آليًا من ملفات
> `src/app/api/v1/**/route.ts` (95 route) ومن `requirePermission(...)` داخلها،
> لكنه لم يُختبر ضد خادم عامل (لا node/docker هنا). للتحقق اليدوي:
> `npm run dev` ثم `curl` مع كوكي جلسة (انظر README).

## 1) الاتفاقيات العامة (4.3)

- **البادئة:** `/api/v1/...` — أي تغيير غير متوافق يرفع الإصدار إلى `/api/v2`.
- **المصادقة:** كوكي جلسة `sms_session` (httpOnly) — رمزها مُجزَّأ في جدول `sessions`؛
  إبطال فوري ممكن. المسارات العامة الوحيدة: `auth/login`.
- **النجاح:** `{ "data": ..., "meta"?: ... }` — القوائم:
  `{ data: [...], meta: { total, page, pageSize, totalPages } }` (دالة `paginated`).
- **الفشل:** `{ "error": { "code", "message", "fieldErrors"?, "requestId" } }`
  مع HTTP status من خريطة `shared/errors` (مثلًا: VALIDATION_ERROR=400،
  UNAUTHORIZED=401، INSUFFICIENT_PERMISSION=403، NOT_FOUND=404،
  VERSION_CONFLICT/CAPACITY_EXCEEDED/SESSION_CONFLICT/OVERPAYMENT/DUPLICATE=409،
  BUSINESS_RULE_VIOLATION=422، ACCOUNT_LOCKED=423، RATE_LIMITED=429).
- **Request ID:** ترويسة `x-request-id` تُعاد في كل رد (تُقبل من الوكيل أو تُولَّد).
- **Pagination:** `?page&pageSize` — الحد الأقصى `pageSize` هو 100 (`listQuerySchema`).
- **الفرز/البحث:** `?sort=&q=` حسب الوحدة.
- **Idempotency-Key:** ترويسة اختيارية للعمليات القابلة للتكرار (الدفعات، الحضور)
  + قيد فريد في الجدول ⇒ إعادة الإرسال تعيد النتيجة السابقة (لا تنفيذ مزدوج).
- **التعديل المتزامن (version/409):** طلبات PATCH/DELETE تحمل `version` الحالية للكيان؛
  عدم التطابق ⇒ `409 VERSION_CONFLICT`.
- **المبالغ:** تُرسل كنصوص عشرية (`"2000.00"`) وتُحوَّل في الخدمة إلى BigInt بأصغر وحدة.
- **التواريخ:** تجارية `YYYY-MM-DD`، والطوابع الزمنية ISO 8601 UTC.

## 2) المسارات (95 route)

الرموز: الصلاحية المطلوبة عبر `requirePermission`. مسارات `auth/*` عامة (بلا جلسة)
عدا logout. `def.permission` في imports تعني صلاحية حسب نوع الكيان المستورد
(مثل `athletes.import`).

### auth (مصادقة)

| المسار | الطرق | الصلاحية |
|--------|--------|----------|
| `/auth/login` | POST | عامة (قفل بعد LOGIN_MAX_ATTEMPTS، TOTP إن فُعّل) |
| `/auth/logout` | POST | جلسة فقط |
| `/auth/change-password` | POST | جلسة فقط |

### athletes / parents

| المسار | الطرق | الصلاحية |
|--------|--------|----------|
| `/athletes` | GET, POST | `athletes.view` / `athletes.create` |
| `/athletes/[id]` | GET, PATCH, DELETE | `athletes.view` / `athletes.edit` / `athletes.delete` |
| `/athletes/[id]/profile` | GET | `athletes.view` (الحقول الطبية تتطلب `athletes.view_sensitive`) |
| `/athletes/[id]/restore` | POST | `athletes.restore` |
| `/athletes/duplicates` | GET | `athletes.view` |
| `/parents` | GET, POST | `parents.view` / `parents.create` |
| `/parents/[id]` | GET, PATCH, DELETE | `parents.view` / `parents.edit` / `parents.delete` |

### المرجعيات (sports / age-categories / venues / coaches / document-types / evaluation-templates)

| المسار | الطرق | الصلاحية |
|--------|--------|----------|
| `/sports` | GET, POST | `sports.view` / `sports.manage` |
| `/sports/[id]` | GET, PATCH, DELETE | `sports.view` / `sports.manage` / `sports.manage` |
| `/age-categories` | GET, POST | `age_categories.view` / `age_categories.manage` |
| `/age-categories/[id]` | GET, PATCH, DELETE | `age_categories.view` / `age_categories.manage` / `age_categories.manage` |
| `/age-categories/suggest` | GET | `age_categories.view` (اقتراح فئة من تاريخ الميلاد) |
| `/venues` | GET, POST | `venues.view` / `venues.manage` |
| `/venues/[id]` | GET, PATCH, DELETE | `venues.view` / `venues.manage` / `venues.manage` |
| `/coaches` | GET, POST | `coaches.view` / `coaches.create` |
| `/coaches/[id]` | GET, PATCH, DELETE | `coaches.view` / `coaches.edit` / `coaches.delete` |
| `/document-types` | GET, POST | `documents.view` / `settings.manage` |
| `/document-types/[id]` | GET, PATCH, DELETE | `documents.view` / `settings.manage` |
| `/evaluation-templates` | GET, POST | `evaluations.view` / `sports.manage` |
| `/evaluation-templates/[id]` | GET, PATCH, DELETE | `evaluations.view` / `sports.manage` |

### groups

| المسار | الطرق | الصلاحية |
|--------|--------|----------|
| `/groups` | GET, POST | `groups.view` / `groups.create` |
| `/groups/[id]` | GET, PATCH, DELETE | `groups.view` / `groups.edit` / `groups.delete` |
| `/groups/[id]/members` | GET, POST, DELETE | `groups.view` / `groups.manage_members` (تجاوز السعة: `groups.override_capacity` + سبب) |
| `/groups/[id]/transfer` | POST | `groups.manage_members` |

### sessions / attendance / scan

| المسار | الطرق | الصلاحية |
|--------|--------|----------|
| `/sessions` | GET, POST | `sessions.view` / `sessions.create` |
| `/sessions/generate` | POST | `sessions.create` (توليد تكراري) |
| `/sessions/[id]` | GET, PATCH, DELETE | `sessions.view` / `sessions.edit` / `sessions.delete` |
| `/sessions/[id]/cancel` | POST | `sessions.edit` (سبب إلزامي) |
| `/sessions/[id]/reschedule` | POST | `sessions.edit` |
| `/attendance` | GET, POST, PATCH | `attendance.view` / `attendance.create` / `attendance.edit` (تعديل خارج النافذة: `attendance.edit_past`) |
| `/attendance/bulk` | POST | `attendance.create` (ورقة حضور جماعية) |
| `/attendance/sheet` | GET | `attendance.view` |
| `/scan` | POST | `attendance.create` (مسح رمز HMAC + منع تكرار scan.dedupSeconds) |

### subscriptions / subscription-types

| المسار | الطرق | الصلاحية |
|--------|--------|----------|
| `/subscription-types` | GET, POST | `subscriptions.view` / `subscriptions.edit` |
| `/subscription-types/[id]` | GET, PATCH, DELETE | `subscriptions.view` / `subscriptions.edit` |
| `/subscriptions` | GET, POST | `subscriptions.view` / `subscriptions.create` (+ `subscriptions.apply_discount` عند الخصم) |
| `/subscriptions/[id]` | GET, PATCH | `subscriptions.view` / `subscriptions.edit` (+ apply_discount) |
| `/subscriptions/[id]/renew` | POST | `subscriptions.create` (+ apply_discount عند الخصم) |
| `/subscriptions/[id]/suspend` | POST | `subscriptions.suspend` (سبب إلزامي) |
| `/subscriptions/[id]/resume` | POST | `subscriptions.suspend` |
| `/subscriptions/[id]/cancel` | POST | `subscriptions.cancel` (سبب إلزامي) |

### payments / receipts / expenses / cash

| المسار | الطرق | الصلاحية |
|--------|--------|----------|
| `/payments` | GET, POST | `payments.view` / `payments.create` (Idempotency-Key مدعوم) |
| `/payments/[id]` | GET, PATCH | `payments.view` / `payments.create` (الملاحظات فقط — المبلغ غير قابل للتعديل) |
| `/payments/[id]/void` | POST | `payments.void` (سبب إلزامي) |
| `/payments/[id]/refund` | POST | `payments.refund` (سبب إلزامي) |
| `/payments/[id]/receipt` | GET | `payments.view` (HTML/PDF الوصل) |
| `/receipts/[id]` | GET | `payments.view` |
| `/receipts/[id]/reprint` | POST | `payments.reprint_receipt` (يزيد reprint_count ويعلّم النسخة) |
| `/expenses` | GET, POST | `expenses.view` / `expenses.create` |
| `/expenses/[id]` | GET, PATCH | `expenses.view` / `expenses.edit` |
| `/expenses/[id]/void` | POST | `expenses.delete` |
| `/expense-categories` | GET, POST | `expenses.view` / `expenses.create` |
| `/expense-categories/[id]` | GET, PATCH, DELETE | `expenses.view` / `expenses.edit` / `expenses.delete` |
| `/cash/transactions` | GET | `cash.view` (دفتر Append-Only) |
| `/cash/opening` | POST | `cash.adjust` (رصيد افتتاحي) |
| `/cash/adjust` | POST | `cash.adjust` (تسوية بسبب إلزامي) |
| `/cash/close-day` | POST | `cash.close_day` |
| `/cash/closings` | GET | `cash.view` |

### evaluations / documents

| المسار | الطرق | الصلاحية |
|--------|--------|----------|
| `/evaluations` | GET, POST | `evaluations.view` / `evaluations.create` |
| `/evaluations/[id]` | GET, PATCH, DELETE | `evaluations.view` / `evaluations.edit` |
| `/evaluations/group/[groupId]` | GET | `evaluations.view` |
| `/evaluations/time-series` | GET | `evaluations.view` |
| `/documents` | GET, POST | `documents.view` / `documents.upload` (فحص Magic Bytes + حدود حجم) |
| `/documents/[id]` | GET, PATCH, DELETE | `documents.view` / `documents.upload` / `documents.delete` |
| `/documents/[id]/download` | GET | `documents.view` (تحميل عبر API مع Audit) |

### dashboard / reports / notifications / imports

| المسار | الطرق | الصلاحية |
|--------|--------|----------|
| `/dashboard` | GET | `reports.view` |
| `/dashboard/attendance` | GET | `reports.view` |
| `/dashboard/charts` | GET | `reports.view` |
| `/dashboard/financial` | GET | `reports.view` + `reports.view_finance` |
| `/reports/[type]` | GET | `reports.view` (المالية: + `reports.view_finance`) — الأنواع: athletes, subscriptions, payments, debts, attendance, absence, late, coaches, sports, groups, revenues, expenses, cash |
| `/reports/[type]/export` | GET | `reports.export` (+ `reports.view_finance` للتقارير المالية) — CSV/Excel معقّم |
| `/notifications` | GET | `notifications.view` |
| `/notifications/[id]/read` | POST | `notifications.view` |
| `/notifications/read-all` | POST | `notifications.view` |
| `/imports` | GET, POST | `athletes.import` / `def.permission` حسب نوع الكيان |
| `/imports/template` | GET | `def.permission` |
| `/imports/[id]/mapping` | GET, POST | `def.permission` |
| `/imports/[id]/preview` | GET | `def.permission` |
| `/imports/[id]/errors` | GET | `def.permission` |
| `/imports/[id]/confirm` | POST | `def.permission` |

### الإدارة (users / roles / settings / audit / backups)

| المسار | الطرق | الصلاحية |
|--------|--------|----------|
| `/users` | GET, POST | `users.manage` |
| `/users/[id]` | GET, PATCH, DELETE | `users.manage` (حماية آخر SUPER_ADMIN → 409 LAST_SUPER_ADMIN) |
| `/users/[id]/reset-password` | POST | `users.manage` |
| `/users/[id]/sessions` | GET, DELETE | `users.manage` (إبطال الجلسات) |
| `/roles` | GET | `roles.manage` |
| `/roles/[role]/permissions` | GET, PUT | `roles.manage` (تخصيص المصفوفة) |
| `/settings` | GET | `settings.manage` |
| `/settings/[key]` | GET, PUT | `settings.manage` (مع Audit SETTINGS_CHANGE) |
| `/audit-logs` | GET | `audit.view` (قراءة فقط — الجدول Append-Only) |
| `/backups` | GET, POST | `backup.manage` |
| `/backups/[id]/download` | GET | `backup.manage` (يُسجَّل كـ VIEW_SENSITIVE) |
| `/backups/restore` | POST | `backup.manage` (تأكيد RESTORE + نسخة أمان قبل الاستعادة + وضع صيانة) |

## 3) ملاحظة اتساق

تستخدم بعض المسارات والمصفوفة الافتراضية أكوادًا غير مشتقة من الكتالوج
(`sports.view`, `venues.view`, `age_categories.view`, `expenses.export` — الكتالوج
يعرّف `manage` فقط لهذه الوحدات). `scripts/seed.ts` يبذر هذه الأكواد الإضافية حتى
تعمل المصفوفة فعليًا. انظر `docs/USER_ROLES.md`.
