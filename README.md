# نظام إدارة رياضية — Sports Management System

نظام إدارة رياضية احترافي ذاتي الاستضافة (Self-Hosted) للنوادي والأكاديميات والجمعيات
الرياضية — **Next.js 14 + Prisma + MySQL/MariaDB + TypeScript (strict)**، عربي RTL بالكامل،
بصلاحيات دقيقة، وسلامة مالية صارمة (BigInt بأصغر وحدة)، وسجل تدقيق Append-Only،
ونسخ احتياطي/استعادة آمنين.

> ## ✅ حالة التحقق (أكتوبر 2026)
> المشروع يعمل محليًا على **MariaDB/MySQL** بعد نقله من PostgreSQL، وكل بند أدناه
> مُتحقَّق بتشغيله فعليًا لا بالقراءة:
> `npm run typecheck` ✅ · `npm run lint` ✅ بلا تحذيرات على **كل المستودع** (src + scripts + ملف الإعداد) ·
> `npm run test` ✅ (180 اختبار وحدة) ·
> `npx playwright test` ✅ **66/66** عبر 6 مقاسات شاشة ضد قاعدة MariaDB محلية ·
> `NODE_ENV=production npm run build` ✅ ·
> الدخول واللوحة وبطاقة طباعة الرياضي تمّ تشغيلها فعليًا في متصفح على `localhost:3000` ·
> النسخ الاحتياطي (`npm run backup`) والاستعادة (`npm run restore`) والمجدول (`npm run worker`)
> شُغِّلت فعليًا وأنتجت ملفات SQL حقيقية وسجلات في `job_runs` ·
> معالج استيراد الرياضيين (رفع ← ربط أعمدة ← معاينة ← اعتماد ← تنزيل ملف الأخطاء)
> يعمل من الواجهة ويُطبّع الخلايا الفارغة ويحوّل عمود النشاط إلى `sportId`.
> النقل إلى MySQL غيّر مكان بعض القيود: كشف تعارض الحصص والتفرّد مع الحذف الناعم
> صارا في طبقة التطبيق (انظر `docs/DATABASE_SCHEMA.md`) بدل قيود EXCLUDE/fهارس جزئية.
> ما لم يُتحقق منه بعد: `npm run seed:load` (اختبار أحمال)، وأرقام P95/`EXPLAIN` الحقيقية.
> أدوات النسخ تحتاج `mysqldump`/`mysql` في PATH أو `MYSQLDUMP_BIN`/`MYSQL_BIN` في `.env`.

## المزايا

- **27 وحدة / 95 مسار API** تحت `/api/v1`: رياضيون وأولياء، مجموعات بسعة مقفلة،
  حصص بكشف تعارض (مدرب/قاعة/مجموعة) في طبقة التطبيق مع قفل صف المجموعة،
  حضور (يدوي/جماعي/مسح رمز HMAC)،
  اشتراكات بحالات وانتقالات وتجديد، دفعات ذرّية مع Idempotency، وصولات تسلسلية
  **بلا فجوات** لكل سنة مالية، مصاريف، دفتر خزينة Append-Only مع إقفال يومي،
  تقييمات، وثائق بفحص Magic Bytes، إشعارات، استيراد CSV/Excel بمعاينة،
  14 نوع تقارير + تصدير معقّم ضد CSV Injection، لوحة تحكم، سجل تدقيق غير قابل
  للتعديل، نسخ احتياطي mysqldump بسياسة GFS واستعادة بتأكيد مكتوب، ومهام مجدولة.
- **أمان:** Argon2id، جلسات DB قابلة للإبطال، قفل brute-force، صلاحيات دقيقة
  3 طبقات، ترويسات أمان أساسية (بلا CSP — النظام يعمل محليًا عبر http)،
  خصوصية القاصرين (حقول طبية محمية بصلاحيات).
- **إعدادات بلا قيم صلبة:** العملة/المنطقة الزمنية/السنة المالية/حدود التأخر…
  كلها من جدول Settings (انظر `docs/ASSUMPTIONS.md`).

## التقنية

Next.js 14 (App Router) · TypeScript strict · Prisma 5 · MySQL / MariaDB (XAMPP) ·
Zod · next-intl (ar) · Tailwind (RTL logical properties) · Argon2 · exceljs ·
Vitest · Playwright · Docker (اختياري).

## المتطلبات

- Node.js ≥ 20، npm
- MySQL أو MariaDB — الأسهل **XAMPP**: شغّل خدمة MySQL من لوحة التحكم، وأضِف
  مجلدها إلى PATH لتوفّر `mysql` و`mysqldump` (النسخ الاحتياطي/الاستعادة)
- اختياري: Docker وDocker Compose

## التثبيت والتشغيل الأول (Windows + XAMPP)

```bash
# 1) الاعتماديات
npm install

# 2) البيئة
cp .env.example .env
# عدّل DATABASE_URL إن لزم، وولّد الأسرار:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ← APP_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ← SESSION_SECRET

# 3) القاعدة (بافتراض مستخدم root بلا كلمة مرور في XAMPP)
mysql -u root -e "CREATE DATABASE IF NOT EXISTS sports_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 4) الجداول من مخطط Prisma + القيود الإضافية
npx prisma db push
mysql -u root sports_management < prisma/raw-constraints.sql

# 5) البذر المرجعي + أول Super Admin
SEED_ADMIN_EMAIL=admin@club.local SEED_ADMIN_PASSWORD='StrongPass!23' npm run seed
# أو قاعدة تجريبية كاملة (مستخدم/رياضيون/اشتراكات/دفعات):
npm run seed:demo      # admin@demo.test / Demo@12345

# 6) فحوصات الجودة
npm run typecheck && npm run lint && npm run test

# 7) اختبارات المتصفح (E2E) — لا تحتاج أي سرّ إضافي: تدخل بحساب seed:demo
npm run seed:demo && npm run test:e2e

# 8) التطوير
npm run dev        # http://localhost:3000
```

> حساب `npm run seed` يولد بـ `mustChangePassword=true` (تغيير إلزامي عند أول دخول).
> اختبارات E2E لا تمسّه: تدخل افتراضيًا بحساب `seed:demo`، فلا تستهلك Suite الاختبارات
> كلمة مرور مديرك الحقيقي.

> إن أردت هجرات مكتوبة بدل `db push` (للإنتاج): `npx prisma migrate dev --name init`
> ثم `npx prisma migrate deploy` — انظر `prisma/migrations/README.md`.

> **الواجهة:** شاشة الدخول + لوحة المؤشرات + شاشات الوحدات (رياضيون، مجموعات، حصص،
> حضور، اشتراكات، دفعات، وصولات، مصاريف، خزينة، وثائق، تقارير، إعدادات، تدقيق)
> جاهزة وتعمل عبر API `/api/v1`. للتغطية التفصيلية: `docs/PROGRESS.md`.

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
npm run test           # vitest (unit) — 180 اختبارًا ناجحًا محليًا
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

> **لم يُختبر (NOT VERIFIED):** لم تُبنَ أي صورة أو تُشغَّل compose في هذه البيئة؛
> المسار المُختبَر محليًا هو XAMPP/localhost.

```bash
docker compose up -d --build db app worker
docker compose run --rm app npx prisma db push      # لا هجرة مولّدة في المستودع
docker compose run --rm app bash -c 'mysql sports_management < prisma/raw-constraints.sql'
docker compose run --rm app npm run seed
docker compose --profile proxy up -d   # nginx + HTTPS (شهاداتك في docker/certs/)
```

تفاصيل كاملة: `docs/DEPLOYMENT.md` (ترتيب الإقلاع، systemd، الأدوار المنفصلة).

## النسخ الاحتياطي والاستعادة

```bash
npm run backup                                   # mysqldump + BackupRecord + checksum + GFS retention
npm run backup -- --kind=auto                    # يومي/أسبوعي/شهري حسب التاريخ
npm run restore -- --list
npm run restore -- --id=<uuid> --reason="..."    # تأكيد مكتوب RESTORE + نسخة أمان قبل الاستعادة + وضع صيانة
```

الإجراءات والحوادث: `docs/RUNBOOK.md`.

## استكشاف الأخطاء

- **"إعداد البيئة غير صالح" عند الإقلاع:** APP_SECRET/SESSION_SECRET يجب أن تكون
  64 hex، وDATABASE_URL موجودًا (fail-fast مقصود — `src/shared/config/env.ts`).
- **"أداة mysqldump غير متوفرة":** أضِف مجلد MySQL (في XAMPP: `C:\xampp\mysql\bin`) إلى PATH.
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
