# الأمن (SECURITY)

> **NOT VERIFIED / لم يُتحقق منه:** كل ما ورد أدناه وصف للكود المكتوب كما هو.
> لم يُجرَ أي اختبار اختراقي أو تشغيل فعلي في بيئة التوثيق (لا node/docker/postgres).
> يجب إجراء فحص أمني حقيقي قبل الإنتاج.

## 1) نموذج التهديد (OWASP Top 10 — 2021)

| التهديد | المواجهة في الكود | الموقع |
|---------|-------------|--------|
| A01 Broken Access Control | تفويض بصلاحيات دقيقة في كل route + نطاق بيانات (own) في الـ Repository + منع IDOR (أدناه) | `shared/permissions/guard.ts`، كل `route.ts` |
| A02 Cryptographic Failures | Argon2id لكلمات المرور، تجزئة رموز الجلسات/المسح/إعادة الضبط (لا تخزين خام)، HTTPS عبر الوكيل العكسي | `shared/auth/password.ts`، `auth/session.ts` |
| A03 Injection | Prisma (استعلامات معاملَة) + Zod على كل مدخل | `modules/*/schema.ts` |
| A04 Insecure Design | ذرّية مالية، Append-Only للخزينة/التدقيق، قيود EXCLUDE في القاعدة | `prisma/raw-constraints.sql` |
| A05 Security Misconfiguration | فحص env fail-fast عند الإقلاع، ترويسات أمان، CSP | `shared/config/env.ts`، `next.config.js` |
| A06 Vulnerable Components | `npm run audit:deps` (npm audit) — **يجب تشغيله دوريًا** | package.json |
| A07 Identification & Authentication Failures | قفل الحساب، رسائل موحدة، TOTP (انظر التحذير أدناه)، إبطال جلسات | `modules/auth/service.ts` |
| A08 Software & Data Integrity | Idempotency-Key + قيود فريدة، checksum SHA-256 للنسخ الاحتياطية | payments/attendance، backups |
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
  (صلاحية + Audit VIEW_SENSITIVE)، وحماية Path Traversal في بناء مسارات النسخ.

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

## 8) ترويسات الأمان وCSP (next.config.js)

تُطبَّق على كل المسارات: `X-Content-Type-Options: nosniff`، `X-Frame-Options: DENY`،
`Referrer-Policy: strict-origin-when-cross-origin`، `Permissions-Policy` (كاميرا self،
ميكروفون/موقع معطلة)، `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`،
وCSP: `default-src 'self'` مع `script-src/style-src 'self' 'unsafe-inline'`
(متطلب Next.js الحالي — **يُستحسن تقييده لاحقًا بـ nonces**)، `frame-ancestors 'none'`.
`poweredByHeader: false`. يمكن تعطيل CSP بـ `ENABLE_CSP=false` (للتشخيص فقط).

## 9) أخطاء وتسريبات

الأخطاء التقنية (غير AppError/Zod/Prisma المعروفة) تُسجَّل في console server-side
وتُعاد كـ `INTERNAL_ERROR` عامة برسالة عربية موحدة — بلا stack traces للعميل (9.2).

## 10) قائمة نواقص/توصيات أمنية صريحة (أمانة)

1. TOTP **مُنفّذ الآن** (otplib + سر مشفّر AES-256-GCM بمفتاح من `SESSION_SECRET`، وتحقق يفشل بأمان) — يتطلب migration لعمود `totp_secret`؛ **لم يُختبر بالتشغيل**.
2. `REVOKE` على audit_logs خطوة يدوية — يجب توثيقها في نشر كل بيئة والتحقق منها.
3. لا يوجد Rate limiting عام على مستوى API حاليًا سوى قفل تسجيل الدخول —
   يُنصح بإضافته عند الوكيل العكسي (nginx `limit_req`) حتى يُنفَّذ في التطبيق.
4. CSP تتضمن `'unsafe-inline'` للسكربتات — تقيد لاحقًا.
5. اختبار الاختراق وفحص `npm audit` لم يُنفذا هنا — نفذهما قبل الإنتاج.
