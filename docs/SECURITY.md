# الأمن (SECURITY)

> **حالة التحقق:** هذا الوصف مُطابَق للكود، وقد **شُغِّلت أجزاء منه فعلًا** على MariaDB 10.11
> المحلية (2026-10-11): ترويسات الأمان المُرسلة فعلًا، رفض المال غير العشري، 401/403 على
> المسارات، قراءة/تنزيل ملفات التخزين عبر حارس المسار، ودورة النسخ/الاستعادة.
> **لم يُجرَ أي اختبار اختراقي**، و`npm audit` لم يُنفَّذ هنا، وعتبات قفل brute-force ورفض
> Magic Bytes لم تُختبر آليًا، و2FA الحيّ عبر الواجهة لم يُجرَّب — يجب إجراء فحص أمني حقيقي
> قبل الإنتاج.

## 1) نموذج التهديد (OWASP Top 10 — 2021)

| التهديد | المواجهة في الكود | الموقع |
|---------|-------------|--------|
| A01 Broken Access Control | تفويض بصلاحيات دقيقة في كل route + نطاق بيانات (own) في الـ Repository + منع IDOR (أدناه) | `shared/permissions/guard.ts`، كل `route.ts` |
| A02 Cryptographic Failures | Argon2id لكلمات المرور، تجزئة رموز الجلسات/المسح/إعادة الضبط (لا تخزين خام)، HTTPS عبر الوكيل العكسي | `shared/auth/password.ts`، `auth/session.ts` |
| A03 Injection | Prisma (استعلامات معاملَة) + Zod على كل مدخل | `modules/*/schema.ts` |
| A04 Insecure Design | ذرّية مالية، Append-Only للخزينة/التدقيق، قيود CHECK في القاعدة + كشف تعارض الحصص في طبقة التطبيق (MySQL لا يطبّق EXCLUDE gist) | `prisma/raw-constraints.sql`، `src/modules/sessions/recurrence.ts` |
| A05 Security Misconfiguration | فحص env fail-fast عند الإقلاع، ترويسات أمان (X-Frame-Options/nosniff/Referrer-Policy/Permissions-Policy) — **بلا CSP: مُعطّلة قصداً في نموذج local-first** (§8) | `shared/config/env.ts`، `next.config.js` |
| A06 Vulnerable Components | `npm run audit:deps` (npm audit) — **يجب تشغيله دوريًا** | package.json |
| A07 Identification & Authentication Failures | قفل الحساب، رسائل موحدة، TOTP (انظر التحذير أدناه)، إبطال جلسات | `modules/auth/service.ts` |
| A08 Software & Data Integrity | Idempotency-Key + قيود فريدة، checksum SHA-256 للنسخ الاحتياطية — ✅ تحقّق بتشغيل `backup`/`restore` على MariaDB (2026-10-11) | payments/attendance، backups |
| A09 Logging & Monitoring Failures | Audit log شامل Append-Only + requestId في كل رد | `shared/audit` |
| A10 SSRF | لا جلب URLs من مدخلات المستخدم (القنوات الخارجية معطلة) | — |

## 2) المصادقة (Authentication)

- **كلمات المرور:** Argon2id (`memoryCost: 19456` — ~19MB، timeCost/parallelism افتراضية
  محددة في `shared/auth/password.ts`). السياسة الدنيا 8 أحرف (`users/schema.ts`).
- **الجلسات:** خادمية في جدول `sessions` — الكوكي `sms_session` يحمل رمزًا عشوائيًا
  **مُجزَّأ (SHA-256) في القاعدة**، `httpOnly`، `sameSite=lax`، و`secure` في الإنتاج.
  انتهاء خامل (SESSION_IDLE_MINUTES=60) + انتهاء مطلق (SESSION_ABSOLUTE_HOURS=24)
  ⇒ إبطال فوري ممكن (per-device عبر `/users/[id]/sessions`).
- **قفل التخمين (Brute-force):** بعد `LOGIN_MAX_ATTEMPTS=5` محاولات فاشلة يُقفل
  الحساب `LOGIN_LOCKOUT_MINUTES=15` (HTTP 423 ACCOUNT_LOCKED)، ورسالة موحدة
  "بريد أو كلمة مرور غير صحيحة" تمنع تعداد الحسابات. كل محاولة فاشلة تُدوَّن
  (LOGIN_FAILED في audit_logs).
- **TOTP (تحقق ثنائي):** ✅ **مُنفّذ**: السر الخام يُولَّد عبر `otplib` ويُخزَّن **مشفّرًا**
  (AES-256-GCM، مفتاح مشتق من `SESSION_SECRET`) في العمود `totp_secret`. `verifyTotpCode`
  يتحقق زمنيًا بنافذة ±1 **ويفشل بأمان** (`shared/auth/totp.ts` + `modules/auth/service.ts`).
  تدفق التفعيل: `POST /auth/totp/setup` ثم `/enable` (يتحقق من الرمز قبل التخزين)،
  و`/disable`. البوابة الفعلية هي إعداد `auth.totpEnabled` (Settings)؛ **لا يعتمد** على
  التفعيل إلا بعد إضافة عمود `totp_secret` (migration) وتشغيل الاختبارات.
- **تغيير/إعادة ضبط كلمة المرور:** `must_change_password` للمستخدمين المُنشأين بـ seed،
  ورموز إعادة ضبط مُجزَّأة بمدة انتهاء واستخدام لمرة واحدة (`password_reset_tokens`).

## 3) التفويض (Authorization) — 3 طبقات + منع IDOR

1. **طبقة الصلاحيات الدقيقة:** `await requirePermission(user, 'module.action')` في
   **كل** route handler. الصلاحيات الفعلية = مصفوفة الدور الافتراضية ± تخصيصات
   `user_role_permissions` (guard.ts). ممنوع فحص الأدوار بنصوص صلبة (CONVENTIONS).
2. **طبقة القواعد:** عمليات حساسة تتطلب أذونات إضافية (مثل
   `groups.override_capacity` + سبب إلزامي، `subscriptions.apply_discount`،
   `payments.void/refund` بأسباب، `attendance.edit_past` خارج النافذة،
   `athletes.view_sensitive` للحقول الطبية).
3. **طبقة نطاق البيانات (Scoping):** في الـ Repository — دور COACH يرى ضمن نطاقه
   (`own` في المصفوفة تُترجم لفلترة بـ `linkedCoachId`/المجموعات)، وكل استعلام
   قائمة يفلتر `deletedAt: null`.

**منع IDOR:** كل وصول لكيان يمر بفحص ملكية/نطاق في الـ service/repository قبل
العمليات (مثل: الدفعة تتحقق أن `subscription.athleteId === input.athleteId`،
وتحميل الوثائق/النسخ يمر بصلاحية الوحدة ويسجَّل في Audit). المعرفات UUID
(غير قابلة للتعداد) — لكنها ليست بديلًا عن فحص الصلاحية.

## 4) أمان الرفع والتخزين (6.3)

- الملفات تُخزَّن **خارج المجلد العام** (`STORAGE_LOCAL_DIR=./storage/private` أو S3)
  بأسماء عشوائية UUID — لا وصول مباشر عبر URL ثابت.
- **فحص Magic Bytes** عند الرفع (`shared/storage`): jpeg/png/webp (مع تحقق WEBP عند
  البايت 8) وpdf فقط — النوع المُعلن من المتصفح لا يُقبل وحده إلا ضمن القائمة المسموحة.
- حدود حجم: `STORAGE_MAX_IMAGE_MB=5`، `STORAGE_MAX_DOCUMENT_MB=10`.
- التنزيل حصريًا عبر `/documents/[id]/download` و`/backups/[id]/download`
  (صلاحية + Audit VIEW_SENSITIVE)، وحماية Path Traversal عبر `resolveStoragePath()` في
  `src/shared/storage/index.ts` (§8) — ✅ مسار القراءة مُجرَّب بالتشغيل عبر رفع الاستيراد
  وتنزيل ملف الأخطاء على MariaDB (2026-10-11)؛ رفض Magic Bytes للوثائق لم يُختبر.

## 5) أمان التصدير (CSV Injection)

كل خلية CSV تبدأ بـ `=` أو `+` أو `-` أو `@` تُباد بـ `'` (SingleQuote) —
`shared/export/csv.ts` — مع BOM لقراءة عربية صحيحة في Excel. تصدير Excel عبر exceljs.

## 6) سجل التدقيق (Append-Only — 6.5)

- كل عملية حساسة (CREATE/UPDATE/DELETE/VOID/REFUND/LOGIN/EXPORT/IMPORT/BACKUP/
  SETTINGS_CHANGE/ROLE_CHANGE/VIEW_SENSITIVE…) تُكتب بـ `writeAudit` **داخل نفس
  معاملة** العملية — قبل/بعد JSON للكيانات الحساسة + requestId + IP + UA.
- **منع التعديل على مستوى القاعدة:** `REVOKE UPDATE, DELETE ON audit_logs FROM <app_role>;`
  (خطوة يدوية موثقة في `prisma/migrations/README.md` — تتطلب دور قاعدة بيانات
  منفصلًا للتطبيق). بدون تنفيذ هذه الخطوة يبقى المنع برمجيًا فقط.

## 7) خصوصية القاصرين وتقليل البيانات

- الحقول الطبية (medical_notes, blood_type, allergies) معزولة بصلاحيات
  `athletes.view_sensitive`، وتُستبعد من DTO الافتراضي (`stripAthlete`).
- `image_consent` موثق لكل رياضي قبل أي استخدام للصور.
- الوصول لملف الرياضي الكامل (profile) والتصدير والنسخ الاحتياطية كلها تُدوَّن.
- القنوات الخارجية (EMAIL/SMS/WHATSAPP) **معطلة افتراضيًا** — لا بيانات أولياء
  تغادر الخادم قبل قرار المالك.
- ⚠️ **متطلبات قانونية محلية (الجزائر):** معالجة بيانات القاصرين وبيانات الصحة
  تخضع للقانون 18-07 (حماية الأشخاص الطبيعيين في معالجة المعطيات ذات الطابع الشخصي)
  ولوائح محلية أخرى. **على المالك مراجعة الالتزامات القانونية مع مختص** (إشعار
  خصوصية، موافقة الأولياء، مدة الاحتفاظ، التصريح لدى السلطة المختصة إن لزم).
  هذا المستند ليس استشارة قانونية.

## 8) ترويسات الأمان (next.config.js)

تُطبَّق على كل المسارات (`/:path*`): `X-Content-Type-Options: nosniff`،
`X-Frame-Options: DENY`، `Referrer-Policy: strict-origin-when-cross-origin`،
`Permissions-Policy` (كاميرا self، ميكروفون/موقع معطلة)، و`poweredByHeader: false`.

- **CSP وHSTS مُعطّلتان قصداً في نموذج local-first**: كانت `default-src 'self'` مع
  `'unsafe-inline'` تمنع تشغيل React في وضع التطوير (لا hydration)، فحُذفتا مع ADR-13 بدل
  أن تُقيَّد CSP بـ nonces. لا يرسل التطبيق ترويسة
  `Content-Security-Policy` إطلاقًا، و`tests/e2e/30-security.spec.ts` يتحقق من الترويسات
  **المُرسلة فعلًا** (X-Frame-Options/nosniff/Referrer-Policy) لا من CSP.
- **المحاذرة:** إن خرج النظام يومًا للإنترنت (وكيل عكسي + HTTPS) فأعد النظر في CSP/HSTS عند
  الوكيل أو في `next.config.js` مع nonces، لأن الحماية الحالية تعتمد على انعدام السكربتات
  الخارجية وعلى أن الوصول محلي/داخلي.
- **مسارات التخزين:** حماية path traversal في قراءة الملفات حصريًا عبر `resolveStoragePath()`
  في `src/shared/storage/index.ts` — تُحوّل `STORAGE_LOCAL_DIR` إلى مسار مطلق مرة واحدة ثم
  تفحص بادئة `base + sep`، وترفض `..` والمفاتيح المطلقة. (كان الخلل السابق يقارن النسبي
  بالمطلق فيرفض **كل** قراءة على Windows؛ ظهر كعطل فعلي في معاينة الاستيراد وملف الأخطاء.)

## 9) أخطاء وتسريبات

الأخطاء التقنية (غير AppError/Zod/Prisma المعروفة) تُسجَّل في console server-side
وتُعاد كـ `INTERNAL_ERROR` عامة برسالة عربية موحدة — بلا stack traces للعميل (9.2).

## 10) قائمة نواقص/توصيات أمنية صريحة (أمانة)

1. TOTP **مُنفّذ الآن** (otplib + سر مشفّر AES-256-GCM بمفتاح من `SESSION_SECRET`، وتحقق يفشل بأمان) — العمود `totp_secret` موجود عبر `prisma db push` على MariaDB؛ **مُغطّى باختبارات وحدة فقط ولم يُجرَّب تدفقه الحيّ عبر الواجهة**.
2. `REVOKE` على audit_logs خطوة يدوية — يجب توثيقها في نشر كل بيئة والتحقق منها.
3. لا يوجد Rate limiting عام على مستوى API حاليًا سوى قفل تسجيل الدخول —
   يُنصح بإضافته عند الوكيل العكسي (nginx `limit_req`) حتى يُنفَّذ في التطبيق.
4. **لا CSP ولا HSTS يُرسلان** (قرارات مقصودة لنموذج local-first — §8 وADR-13): الحماية
   الحالية تعتمد على انعدام السكربتات الخارجية وعلى أن الوصول شبكة داخلية/جهاز محلي.
   عند الخروج للإنترنت يجب إضافة CSP بـ nonces (بلا `'unsafe-inline'`) وHSTS عند الوكيل العكسي.
5. اختبار الاختراق وفحص `npm audit` لم يُنفذا هنا — نفذهما قبل الإنتاج.
6. عتبات قفل brute-force (5/15د) ورفض Magic Bytes للوثائق: لم تُختبر آليًا.
