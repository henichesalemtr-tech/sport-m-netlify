# البنية المعمارية (ARCHITECTURE)

> **NOT VERIFIED / لم يُتحقق منه:** وُثّقت البنية من قراءة الكود في بيئة بلا
> node/npm/docker/PostgreSQL — لم يُبنَ أو يُشغَّل النظام هنا.

## 1) النمط العام: Modular Monolith على Next.js 14

تطبيق واحد (Next.js App Router) مقسّم داخليًا إلى وحدات مستقلة بمنطق أعمال واضح،
مع قاعدة بيانات PostgreSQL واحدة. لا microservices: حجم الفريق/النادي لا يبررها،
والذرّية المالية (Transactions) أسهل كثيرًا في عملية واحدة.
انظر `docs/DECISIONS.md` (ADR-1).

```
 المتصفح (UI عربية RTL)
   │  fetch /api/v1/...  (كوكي جلسة httpOnly)
   ▼
 Route Handlers — src/app/api/v1/**/route.ts
   │  apiRoute() من @/shared/api/route:
   │  Authenticate (جلسة DB) → Validate (Zod) → [Authorize داخل الـ handler]
   ▼
 Service Layer — src/modules/<m>/service.ts
   │  قواعد العمل + prisma.$transaction + writeAudit (في نفس المعاملة)
   ▼
 Repository Layer — src/modules/<m>/repository.ts
   │  استعلامات Prisma فقط + نطاق البيانات (Scoping: soft-delete، own-data)
   ▼
 PostgreSQL (Prisma) + قيود SQL خام (EXCLUDE، فهارس جزئية، REVOKE)
```

**قاعدة صارمة (docs/CONVENTIONS.md):** route لا يحتوي منطق أعمال، service لا يحتوي
SQL خامًا غير ضروري، repository لا يحتوي قواعد عمل.

## 2) هيكل المجلدات

```
prisma/
  schema.prisma          # 30+ نموذج — مصدر حقيقة المخطط
  raw-constraints.sql    # EXCLUDE gist، فهارس جزئية، pg_trgm/btree_gist، REVOKE
  migrations/README.md   # الهجرة يولّدها المستخدم (prisma migrate dev)
scripts/                 # seed / seed-demo / seed-load / backup / restore / worker
docker/                  # Dockerfile + nginx.conf
src/
  app/
    api/v1/              # 95 route handler (المصادقة، الرياضيون، ... النسخ)
    (واجهة UI — غير مكتملة بعد؛ انظر docs/PROGRESS.md)
  modules/               # 27 وحدة: schema.ts + repository.ts + service.ts (+ اختبارات)
  jobs/                  # سجل المهام المجدولة + runner بأقفال JobRun.lockKey
  shared/
    api/                 # apiRoute غلاف موحّد + Meta + listQuerySchema (pagination)
    auth/                # argon2id (password.ts) + جلسات DB وكوكي (session.ts)
    permissions/         # catalog.ts (الأكواد+المصفوفة) + guard.ts (requirePermission)
    money/               # BigInt بأصغر وحدة: toMinorUnits/applyDiscount/remaining
    dates/               # todayIn/periodRange/fiscalYear/calcAge (مناطق زمنية)
    errors/              # AppError + ErrorCode → HTTP (خريطة موحدة)
    audit/               # writeAudit (يُستدعى داخل المعاملات)
    db/                  # PrismaClient singleton
    config/              # env (Zod fail-fast) + إعدادات runtime
    storage/             # تخزين مجرد (local/S3) + فحص Magic Bytes
    export/              # CSV (تعقيم حقن الصيغ + BOM) و Excel (exceljs)
    i18n/                # next-intl (messages/ar.json)
    idempotency/ notifications/ text/ validation/
```

## 3) قرارات بنيوية رئيسية (ملخص — التفاصيل في DECISIONS.md)

| القرار | السبب الجوهري |
|--------|---------------|
| Next.js 14 modular monolith | نشر بسيط على خادم نادي محلي، SSR، API+UI في مستودع واحد |
| Prisma + PostgreSQL | إنتاجية + أمان استعلامات؛ PostgreSQL إلزامي لـ EXCLUDE gist والفهارس الجزئية |
| BigInt بأصغر وحدة للمال | لا أخطاء float مالية إطلاقًا (ADR-3) |
| Argon2id + جلسات في DB | تجزئة قوية + إبطال فوري للجلسات وقابلية تدقيق (ADR-4) |
| تفويض بصلاحيات دقيقة (3 طبقات) | ممنوع `role === 'ADMIN'`؛ requirePermission + مصفوفة قابلة للتخصيص + نطاق بيانات في الـ repository |
| next-intl + خط Cairo محلي | عربية RTL أولًا بلا اعتماد على شبكة خارجية (ADR-5) |
| worker/cron داخل العملية | لا Redis/BullMQ — JobRun.lockKey يمنع التشغيل المزدوج (ADR-10) |
| SQL خام للقيود الخاصة | Prisma لا يعبر عن EXCLUDE/الفهارس الجزئية/REVOKE (ADR-11) |
| ذرّية كاملة للعمليات المالية | payment = دفعة + إعادة اشتقاق paidAmount + قيد خزينة + وصل + Audit في `$transaction` واحد |

## 4) تدفق الطلب (Request Lifecycle)

1. **Route**: `apiRoute({params?, body?, auth?, handler})` — يقرأ `x-request-id`
   (أو يولده)، يستخرج IP/User-Agent، يجلب الجلسة من كوكي `sms_session`
   (تجزئة الرمز في DB، idle + absolute expiry).
2. **Validation**: مخططات Zod مشتركة FE/BE (`modules/<m>/schema.ts`)؛ أخطاء Zod →
   400 مع `fieldErrors`.
3. **Authorization**: `await requirePermission(user, 'module.action')` داخل الـ handler؛
   الصلاحيات الفعلية = افتراضي الدور ± تخصيصات `user_role_permissions` (guard.ts).
4. **Service**: قواعد العمل، `prisma.$transaction`، `writeAudit` داخل المعاملة،
   رمي `AppError` بأكواد ثابتة (CAPACITY_EXCEEDED, OVERPAYMENT_NOT_ALLOWED,
   VERSION_CONFLICT → 409 …).
5. **الاستجابة**: نجاح `{data, meta?}`؛ قوائم `paginated()`؛ فشل
   `{error:{code,message,fieldErrors?,requestId}}` — أخطاء Prisma معروفة تُترجم
   (P2002→409 DUPLICATE_RECORD، P2025→404)؛ غير المعروف → 500 عام بلا تسريب تفاصيل.

## 5) التزامن والسلامة

- **Optimistic locking**: حقل `version` في كل كيان رئيسي؛ عدم تطابق → `VERSION_CONFLICT` (409).
- **Pessimistic locking**: قفل صف الاشتراك عند الدفع، قفل صف المجموعة عند إضافة عضو،
  قفل استشاري (advisory) لتسلسل أرقام الحركات/الوصولات لكل سنة مالية.
- **Idempotency**: `Idempotency-Key` + قيد فريد في payments/attendance؛
  عند P2002 تُعاد النتيجة السابقة بدل تنفيذ مزدوج.
- **Soft delete**: `deletedAt` + فهارس فريدة جزئية `WHERE deleted_at IS NULL`.

## 6) المهام المجدولة (src/jobs)

سجل مهام (expire-subscriptions, generate-notifications, expiring-documents, backup,
reconcile) يشغّله `scripts/worker.ts` (حلقة أو `--once` عبر cron). كل تشغيل يُقفل
بـ `JobRun.lockKey` فريد (يومي/ساعي) ⇒ أمان التشغيل المزدوج، و`recoverStaleJobs`
تسترد المهام المنقطعة بعد انهيار/نشر.

## 7) حدود النظام

- **التخزين**: ملفات خاصة خارج المجلد العام (`STORAGE_LOCAL_DIR` أو S3-compatible)؛
  التنزيل عبر مسارات API تفحص الصلاحية وتسجّل Audit.
- **القنوات الخارجية** (SMTP/SMS/WhatsApp): البنية موجودة
  (`notification_deliveries`) لكنها معطلة افتراضيًا (`SMTP_ENABLED=false`).
- **اللغة**: `messages/ar.json` فقط حاليًا — البنية تدعم إضافة لغات.
