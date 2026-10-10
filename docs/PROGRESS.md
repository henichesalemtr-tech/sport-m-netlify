# حالة التقدم (PROGRESS)

## ⚠️ قيد البيئة — اقرأ أولًا / ENVIRONMENT LIMITATION

**بيئة كتابة هذا المستودع لا تحتوي node أو npm أو docker أو PostgreSQL.**
نتيجة ذلك بصدق كامل:

- **لم يُبنَ المشروع** (`npm run build` لم يُنفَّذ).
- **لم يُشغَّل** (`npm run dev`/`start` لم يُنفذا).
- **لم يُختبر** — لا unit ولا integration ولا E2E؛ ملفات الاختبار (`*.test.ts` تحت
  `src/` و`*.spec.ts` تحت `tests/e2e/`) **لم تُشغَّل ولا مرة**.
- **لم تُنفَّذ السكربتات** (seed/seed-demo/seed-load/backup/restore/worker) —
  كُتبت ولم تُجرَّب.
- **لم تُبنَ صورة Docker** ولم يُجرَّب docker-compose.
- **لا توجد هجرة Prisma مولدة** (`prisma/migrations/` يحتوي README يشرح كيفية
  التوليد — انظره).
- أقرب بديل متاح: مراجعة كود صارمة + توثيق صادق + أوامر تحقق جاهزة
  (`docs/TESTING.md` §5، `README.md` §التشغيل الأول).

أي عبارة "يعمل/ينجح" في أي وثيقة أخرى تعني **"الكود مكتوب بهذا السلوك المقصود"**
وليست نتيجة تنفيذ. لا توجد أرقام تغطية أو نتائج EXPLAIN ANALYZE لأنها ستكون مفبركة.

## المراحل (Phases 0–12)

| المرحلة | الوصف | حالة الكود | التحقق التشغيلي |
|---------|-------|------------|-----------------|
| 0 | الأساس: هيكل المستودع، tsconfig (strict)، Tailwind+RTL، ESLint/Prettier، vitest/playwright configs، .env.example | ✅ مكتوب | ❌ UNVERIFIED (لم يُشغَّل typecheck/lint) |
| 1 | مخطط قاعدة البيانات: `prisma/schema.prisma` (كل النماذج/Enums) + `raw-constraints.sql` | ✅ مكتوب | ❌ UNVERIFIED (لم يُطبَّق على PostgreSQL) |
| 2 | الطبقة المشتركة `src/shared/*`: api/route، auth (argon2+sessions)، permissions (catalog+guard)، money، dates، errors، audit، db، config، storage (magic bytes)، export (CSV/Excel)، i18n (ar.json)، idempotency، text، validation | ✅ مكتوب | ❌ UNVERIFIED |
| 3 | المصادقة والتفويض: login/logout/change-password، قفل brute-force، جلسات DB، requirePermission، تخصيص الأدوار، TOTP (otplib + سر مشفّر) | ✅ backend مكتوب — ⚠️ TOTP يتطلب `totp_secret` migration | ❌ UNVERIFIED |
| 4 | الكيانات الأساسية: sports، age-categories، venues، coaches، parents، athletes (كشف تكرار، أرقام تسجيل، حقول حساسة)، groups (سعة بقفل صف) | ✅ مكتوب + اختبارات نقية (لم تُشغَّل) | ❌ UNVERIFIED |
| 5 | الجدولة والحضور: sessions (توليد تكراري + EXCLUDE)، attendance (فردي/جماعي/نافذة تعديل/غياب متتابع)، scan (HMAC+dedup) | ✅ مكتوب | ❌ UNVERIFIED |
| 6 | الماليات: subscription-types، subscriptions (حالات/تجديد/خصم)، payments (ذرّية+Idempotency+overpay)، receipts (gapless+reprint+void)، expenses، cash (append-only+close-day) | ✅ مكتوب + اختبارات ناقة | ❌ UNVERIFIED |
| 7 | التقارير واللوحة: reports (14 نوعًا + export CSV/Excel)، dashboard (مؤشرات/رسوم/مالي)، evaluations (+time-series) | ✅ backend مكتوب | ❌ UNVERIFIED |
| 8 | المستندات والإشعارات والاستيراد: documents (أنواع/رفع/تنزيل/انتهاء)، notifications (dedupe+قنوات معطلة)، imports (رفع→mapping→preview→errors→confirm) | ✅ مكتوب | ❌ UNVERIFIED |
| 9 | الإدارة والتشغيل: users (+sessions/reset)، roles، settings، audit-logs، backups (pg_dump+GFS+restore آمن)، jobs (5 مهام+runner بأقفال) | ✅ مكتوب | ❌ UNVERIFIED |
| 10 | التدعيم الأمني: ترويسات/CSP (next.config)، تعقيم CSV، magic bytes، LAST_SUPER_ADMIN، fail-fast env | ✅ مكتوب | ❌ UNVERIFIED |
| 11 | الواجهة (UI): `src/app/layout.tsx` + `src/shared/ui-kit/*` + شاشات/صفحات لكل الوحدات تحت `src/app/[locale]/(app)/*` + تسجيل دخول + 2FA في قائمة المستخدم | ✅ مكتوب | ❌ UNVERIFIED (لم تُشغَّل المتصفح/البناء) |
| 12 | الاختبارات + السكربتات + الوثائق + النشر: اختبارات وحدة نقية (`src/**/*.test.ts`)، اختبارات E2E Playwright (`tests/e2e/*.spec.ts`)، سكربت TOTP، scripts/* (seed/demo/load/backup/restore/worker)، docker/*، docs/* | ✅ مكتوب | ❌ UNVERIFIED (لم تُشغَّل) |

## ما هو code-complete مقابل ما يحتاج بيئة حقيقية

**مكتوب بالكامل (backend):** 27 وحدة (schema+repository+service)، 95+ route handler
تحت `src/app/api/v1`، الطبقة المشتركة، سجل المهام، قيود SQL الخام، اختبارات وحدة
نقية (`src/**/*.test.ts` بما فيها TOTP)، اختبارات E2E (`tests/e2e/*.spec.ts`)،
السكربتات التشغيلية، ملفات Docker، الوثائق.

**ناقص/متبقٍ (يتطلب عملًا وليس تحققًا فقط):**
1. ~~صفحات الواجهة~~ **اكتملت**: شاشات + صفحات لكل الوحدات (athletes/parents/coaches/venues/sports/age-categories/groups/subscriptions/payments/expenses/cash/reports/attendance/scan/evaluations/documents/notifications/users/roles/settings/audit-logs/backups + 2FA في قائمة المستخدم) — **UNVERIFIED**.
2. ~~إكمال TOTP~~ **مُنفّذ**: `src/shared/auth/totp.ts` + خدمة setup/enable/disable + تسجيل الدخول يتحقق فعليًا (يفشل بأمان). يتطلب إضافة عمود `totp_secret` (migration).
3. **توليد هجرة Prisma** (`prisma migrate dev --name init`) — لم تُولَّد هنا.
4. **Setup Wizard** لإنشاء أول Super Admin من الواجهة — غير منفذ؛ البديل الموثق
   حاليًا `SEED_ADMIN_*` مع `npm run seed`.

**يحتاج بيئة حقيقية للتحقق (كل شيء آخر):** البناء، typecheck، lint، كل الاختبارات،
الهجرات، قيود EXCLUDE تحت التزامن، السكربتات، Docker، مقاييس الأداء (PERFORMANCE)،
وتوثيق النتائج في TESTING/FINAL_AUDIT.

## أول أوامر يجب تنفيذها في بيئة حقيقية

```bash
npm install
cp .env.example .env        # املأ DATABASE_URL + openssl rand -hex 32 للأسرار
npm run typecheck           # أول فحص حقيقي لسلامة الكود المكتوب
npm run lint
npm run test
npx prisma migrate dev --name init
psql "$DATABASE_URL" -f prisma/raw-constraints.sql
npm run seed
npm run build
npm run dev                 # ثم جرّب POST /api/v1/auth/login ...
```

> توقع صريح: كود بهذا الحجم لم يُصرَّف مرة واحدة **قد يحتوي أخطاء TypeScript
> أو استيراد** — `npm run typecheck` هي خطوة العلاج الأولى، وأي فشل هناك هو عمل
> مبرمج متوقع وليس عيبًا في هذه الوثائق.
