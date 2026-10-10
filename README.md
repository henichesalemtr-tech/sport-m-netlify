# نظام إدارة رياضية — Sports Management System

نظام إدارة رياضية احترافي ذاتي الاستضافة (Self-Hosted) للنوادي والأكاديميات والجمعيات
الرياضية — **Next.js 14 + Prisma + PostgreSQL + TypeScript (strict)**، عربي RTL بالكامل،
بصلاحيات دقيقة، وسلامة مالية صارمة (BigInt بأصغر وحدة)، وسجل تدقيق Append-Only،
ونسخ احتياطي/استعادة آمنين.

> ## ⚠️ ملاحظة أمانة مهمة / IMPORTANT HONESTY NOTE
> **كُتب هذا المستودع (كودًا ووثائق) في بيئة لا تحتوي node أو npm أو docker أو
> PostgreSQL — لذلك لم يُصرَّف ولم يُبنَ ولم يُشغَّل ولم يُختبر أي جزء منه هنا
> (NOT BUILT / NOT RUN / NOT TESTED).** كل الوثائق تعلّم بصدق ما هو
> "كود موجود غير مُتحقَّق تشغيليًا" مقابل "PENDING بيئة حقيقية".
> أول ما تفعله في بيئة حقيقية (أوامر التشغيل الأول أدناه): `npm install` ثم
> `npm run typecheck` ثم `npm run test` ثم البناء — وتوقّع إصلاح أخطاء تصرّف
> محتملة لأن الكود لم يمر بالمصرّف قط.

## المزايا

- **27 وحدة / 95 مسار API** تحت `/api/v1`: رياضيون وأولياء، مجموعات بسعة مقفلة،
  حصص بكشف تعارض في قاعدة البيانات (EXCLUDE gist)، حضور (يدوي/جماعي/مسح رمز HMAC)،
  اشتراكات بحالات وانتقالات وتجديد، دفعات ذرّية مع Idempotency، وصولات تسلسلية
  **بلا فجوات** لكل سنة مالية، مصاريف، دفتر خزينة Append-Only مع إقفال يومي،
  تقييمات، وثائق بفحص Magic Bytes، إشعارات، استيراد CSV/Excel بمعاينة،
  14 نوع تقارير + تصدير معقّم ضد CSV Injection، لوحة تحكم، سجل تدقيق غير قابل
  للتعديل، نسخ احتياطي pg_dump بسياسة GFS واستعادة بتأكيد مكتوب، ومهام مجدولة.
- **أمان:** Argon2id، جلسات DB قابلة للإبطال، قفل brute-force، صلاحيات دقيقة
  3 طبقات، ترويسات أمان + CSP، خصوصية القاصرين (حقول طبية محمية بصلاحيات).
- **إعدادات بلا قيم صلبة:** العملة/المنطقة الزمنية/السنة المالية/حدود التأخر…
  كلها من جدول Settings (انظر `docs/ASSUMPTIONS.md`).

## التقنية

Next.js 14 (App Router) · TypeScript strict · Prisma 5 · PostgreSQL (≥15) ·
Zod · next-intl (ar) · Tailwind (RTL logical properties) · Argon2 · exceljs ·
Vitest · Playwright · Docker (اختياري).

## المتطلبات

- Node.js ≥ 20، npm
- PostgreSQL ≥ 15 (+ أدوات العميل `pg_dump`/`pg_restore`/`psql` على خادم التطبيق)
- اختياري: Docker وDocker Compose

## التثبيت والتشغيل الأول (بيئة حقيقية)

```bash
# 1) الاعتماديات
npm install

# 2) البيئة
cp .env.example .env
# عدّل DATABASE_URL، وولّد الأسرار:
openssl rand -hex 32   # ← APP_SECRET
openssl rand -hex 32   # ← SESSION_SECRET

# 3) قاعدة البيانات
sudo -u postgres createdb sports_management
# (موصى به: دور تطبيق منفصل sms_app — انظر docs/DEPLOYMENT.md §3)

# 4) الهجرة + القيود الخام (EXCLUDE/فهارس جزئية)
npx prisma migrate dev --name init     # يولّد الهجرة الأولى (لا توجد هجرة مولدة في المستودع — انظر prisma/migrations/README.md)
psql "$DATABASE_URL" -f prisma/raw-constraints.sql

# 5) (موصى به) Append-Only حقيقي لسجل التدقيق
psql "$DATABASE_URL" -c "REVOKE UPDATE, DELETE ON audit_logs FROM sms_app;"

# 6) البذر المرجعي + أول Super Admin
SEED_ADMIN_EMAIL=admin@club.local SEED_ADMIN_PASSWORD='StrongPass!23' npm run seed

# 7) فحوصات الجودة (أول تشغيل حقيقي للكود)
npm run typecheck && npm run lint && npm run test

# 8) التطوير
npm run dev        # http://localhost:3000
```

> **الواجهة (UI) غير مكتملة حاليًا** — الموجود layout + مكونات ui-kit؛ الصفحات
> لم تُبنَ بعد (انظر `docs/PROGRESS.md` المرحلة 11). النظام قابل للاستخدام عبر
> API مباشرة (`docs/API_DOCUMENTATION.md`).

## متغيرات البيئة

كلها موثقة في `.env.example` و`docs/DEPLOYMENT.md` §2 (DATABASE_URL، APP_SECRET،
SESSION_SECRET — إلزامية؛ والبقية بافتراضات آمنة: SMTP/TOTP معطلان، أفريقيا/الجزائر،
DZD…).

## قاعدة البيانات والبذر

| الأمر | الوظيفة |
|-------|---------|
| `npm run prisma:migrate` | هجرة تطوير (توليد + تطبيق) |
| `npm run prisma:deploy` | تطبيق الهجرات (إنتاج) |
| `npm run seed` | مرجعيات الإنتاج (صلاحيات، مصفوفة أدوار، طرق دفع، فئات مصاريف، أنواع وثائق، فئات عمرية، إعدادات) — Idempotent |
| `npm run seed:demo` | بيانات تجريبية عبر طبقة الخدمات — **يرفض NODE_ENV=production** |
| `npm run seed:load` | بيانات أداء (5k رياضي/50k دفعة/500k حضور) — **يرفض production** |

## التطوير والاختبار والبناء

```bash
npm run dev            # تطوير
npm run test           # vitest (unit) — لم تُشغَّل في بيئة التأليف
npm run test:coverage  # تغطية
npm run test:e2e       # Playwright
npm run typecheck      # tsc --noEmit
npm run lint
npm run build          # prisma generate && next build
npm run verify         # lint + typecheck + test + build
```

## الإنتاج

```bash
npm ci && npm run build
NODE_ENV=production npm run start
npm run worker                       # أو cron: npm run worker -- --once
```

### Docker

```bash
docker compose up -d --build db app worker
docker compose run --rm app npx prisma migrate deploy
docker compose run --rm app bash -c 'psql "$DATABASE_URL" -f prisma/raw-constraints.sql'
docker compose run --rm app npm run seed
docker compose --profile proxy up -d   # nginx + HTTPS (شهاداتك في docker/certs/)
```

تفاصيل كاملة: `docs/DEPLOYMENT.md` (ترتيب الإقلاع، systemd، الأدوار المنفصلة).

## النسخ الاحتياطي والاستعادة

```bash
npm run backup                                   # pg_dump -Fc + BackupRecord + checksum + GFS retention
npm run backup -- --kind=auto                    # يومي/أسبوعي/شهري حسب التاريخ
npm run restore -- --list
npm run restore -- --id=<uuid> --reason="..."    # تأكيد مكتوب RESTORE + نسخة أمان قبل الاستعادة + وضع صيانة
```

الإجراءات والحوادث: `docs/RUNBOOK.md`.

## استكشاف الأخطاء

- **"إعداد البيئة غير صالح" عند الإقلاع:** APP_SECRET/SESSION_SECRET يجب أن تكون
  64 hex، وDATABASE_URL موجودًا (fail-fast مقصود — `src/shared/config/env.ts`).
- **"أداة pg_dump غير متوفرة":** ثبّت PostgreSQL client tools على خادم التطبيق.
- **409 SESSION_CONFLICT / CAPACITY_EXCEEDED / OVERPAYMENT:** قواعد عمل مقصودة —
  `docs/BUSINESS_RULES.md`.
- **403 رغم دور صحيح:** راجع مصفوفة الصلاحيات وشغّل `npm run seed`
  (يبذر أكواد `*.view` الإضافية) — `docs/USER_ROLES.md` §3.
- المزيد: `docs/RUNBOOK.md` §4.

## الوثائق

`docs/`: PROJECT_SPECIFICATION · ARCHITECTURE · DATABASE_SCHEMA · API_DOCUMENTATION ·
SECURITY · TESTING · DEPLOYMENT · RUNBOOK · USER_ROLES · BUSINESS_RULES · DECISIONS ·
ASSUMPTIONS · PROGRESS · PERFORMANCE · FINAL_AUDIT · CONVENTIONS.

## الترخيص

خاص — لم يُحدد بعد من قبل المالك.
