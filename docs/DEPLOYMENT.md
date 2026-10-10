# النشر (DEPLOYMENT)

> **NOT VERIFIED / لم يُتحقق منه:** لم تُبنَ صورة Docker ولم يُنشَر النظام في بيئة
> التوثيق (لا node/npm/docker/postgres). الأوامر أدناه جاهزة لكنها **لم تُنفَّذ هنا**.

## 1) المتطلبات

- Node.js ≥ 20 (engines في package.json)، npm.
- **PostgreSQL ≥ 15** (إلزامي للإنتاج — btree_gist، EXCLUDE، فهارس جزئية، BIGINT).
- أدوات عميل PostgreSQL على خادم التطبيق: `pg_dump`/`pg_restore`/`psql`
  (تستخدمها خدمة النسخ الاحتياطي عبر child_process).
- معكوس بروكسي TLS (nginx مُرفق اختياريًا في docker-compose).

## 2) متغيرات البيئة (`.env` — من `.env.example`)

| المتغير | الوصف | افتراضي |
|---------|-------|---------|
| `NODE_ENV` | development/production/test | development |
| `DATABASE_URL` | سلسلة اتصال PostgreSQL (Prisma) | — **إلزامي** |
| `APP_SECRET` / `SESSION_SECRET` | 64 hex (ولّدها: `openssl rand -hex 32`) — فشل الإقلاع إن ناقصة (Zod fail-fast) | — **إلزامي** |
| `SESSION_IDLE_MINUTES` / `SESSION_ABSOLUTE_HOURS` | انتهاء الجلسات | 60 / 24 |
| `APP_TIMEZONE` | منطقة المؤسسة (تُضبط أيضًا من Settings) | Africa/Algiers |
| `STORAGE_DRIVER` | local / s3 | local |
| `STORAGE_LOCAL_DIR` | مجلد الملفات الخاصة (خارج public) | ./storage/private |
| `STORAGE_MAX_IMAGE_MB` / `STORAGE_MAX_DOCUMENT_MB` | حدود الرفع | 5 / 10 |
| `S3_*` | لوضع s3 | — |
| `SMTP_ENABLED` + `SMTP_*` | البريد — **معطل افتراضيًا** | false |
| `TOTP_ENABLED` | التحقق الثنائي — **معطل افتراضيًا**؛ التفعيل الفعلي يتحقق عبر otplib مع سر مشفّر (يتطلب `totp_secret` migration — انظر SECURITY §2) | false |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | قفل التخمين | 5 / 15 |
| `SCAN_DEDUP_SECONDS` | منع تكرار المسح | 10 |
| `BACKUP_DIR` + `BACKUP_RETENTION_{DAILY,WEEKLY,MONTHLY}` | النسخ والاحتفاظ GFS | ./storage/backups، 7/4/6 |
| `LOG_LEVEL`, `ENABLE_CSP`, `APP_URL` | تشغيل عام | info, true, http://localhost:3000 |
| `SEED_ADMIN_EMAIL/PASSWORD/FULL_NAME` | اختياري — إنشاء أول Super Admin أثناء seed | — |
| `WORKER_INTERVAL_MINUTES` | دورة العامل | 15 |

## 3) النشر اليدوي (خادم Linux + systemd اختياري)

```bash
# 1) الكود
git clone <repo> /opt/sms && cd /opt/sms
npm ci

# 2) البيئة
cp .env.example .env
# عدّل DATABASE_URL وولّد الأسرار:
openssl rand -hex 32   # → APP_SECRET
openssl rand -hex 32   # → SESSION_SECRET

# 3) قاعدة البيانات (أنشئ دورين: owner للهجرات، وsms_app محدود للتطبيق)
sudo -u postgres psql -c "CREATE ROLE sms_app LOGIN PASSWORD '...';"
sudo -u postgres createdb -O sms_app sports_management

# 4) الهجرة + القيود الخام
npx prisma migrate deploy
psql "$DATABASE_URL" -f prisma/raw-constraints.sql
# 5) (موصى به) سحب UPDATE/DELETE على audit_logs من دور التطبيق:
psql "$DATABASE_URL" -c "REVOKE UPDATE, DELETE ON audit_logs FROM sms_app;"

# 6) البذر المرجعي (+ أول Super Admin اختياريًا)
SEED_ADMIN_EMAIL=admin@club.local SEED_ADMIN_PASSWORD='...' npm run seed

# 7) البناء والتشغيل
npm run build
NODE_ENV=production npm run start        # أو pm2/systemd unit

# 8) العامل المجدول (خدمة منفصلة أو cron)
npm run worker                           # حلقة كل WORKER_INTERVAL_MINUTES
# أو cron: 0,15,30,45 * * * * cd /opt/sms && npm run worker -- --once
```

## 4) Docker (مُرفق — لم يُختبر هنا)

الملفات: `docker/Dockerfile` (multi-stage، node:20-slim + postgresql-client)،
`docker-compose.yml` (db + app + worker + proxy اختياري)، `docker/nginx.conf`.

```bash
# .env مطلوب (POSTGRES_PASSWORD إلزامي + أسرار التطبيق)
docker compose up -d --build db app worker

# التهيئة الأولى:
docker compose run --rm app npx prisma migrate deploy
docker compose run --rm app bash -c 'psql "$DATABASE_URL" -f prisma/raw-constraints.sql'
docker compose run --rm app npm run seed            # + SEED_ADMIN_* إن رغبت

# HTTPS عبر nginx (ضع الشهادات في docker/certs/):
docker compose --profile proxy up -d
```

### ترتيب الإقلاع (Boot Order)

1. `db` — healthcheck `pg_isready` (compose: `condition: service_healthy`).
2. الهجرات: `prisma migrate deploy` ← `raw-constraints.sql` ← (اختياري) REVOKE.
3. `seed` (Idempotent — آمن دائمًا).
4. `app` — يفحص env عند أول استخدام (fail-fast برسالة عربية واضحة).
5. `worker` — بعد db؛ أقفال JobRun تجعل تشغيله المتزامن مع app آمنًا.
6. `proxy` — بعد app.

## 5) أنواع البذر

| الأمر | الغرض | بيئة |
|-------|-------|------|
| `npm run seed` | مرجعيات الإنتاج: صلاحيات + مصفوفة أدوار + طرق دفع + فئات مصاريف + أنواع وثائق + فئات عمرية + إعدادات افتراضية (+ Super Admin عبر SEED_ADMIN_*) — Idempotent، بلا مستخدمين تجريبيين | كلها |
| `npm run seed:demo` | بيانات تجريبية عبر طبقة الخدمات — **يرفض NODE_ENV=production** | تطوير فقط |
| `npm run seed:load` | بيانات أداء ضخمة (5k رياضي/50k دفعة/500k حضور) — **يرفض production** | تطوير/اختبار فقط |

## 6) التحديثات (Upgrades)

```bash
git pull && npm ci
npx prisma migrate deploy          # هجرات جديدة إن وجدت
psql "$DATABASE_URL" -f prisma/raw-constraints.sql   # آمن (IF NOT EXISTS) عدا قيود EXCLUDE/CHECK المكررة*
npm run build && systemctl restart sms sms-worker    # أو docker compose up -d --build
```

\* ملف raw-constraints.sql يستخدم IF NOT EXISTS للفهارس، لكن `ADD CONSTRAINT`
للـ EXCLUDE/CHECK سيفشل إن طُبّق مرتين — طبّقه مرة واحدة لكل قاعدة، أو ادمجه في
الهجرة كما هو مشروح في `prisma/migrations/README.md`.

## 7) ما بعد النشر

- فعّل النسخ الاحتياطي المجدول (عامل worker يشمل مهمة backup يوميًا) + انسخ
  `BACKUP_DIR` خارج الخادم.
- راجع `docs/RUNBOOK.md` (استعادة، حوادث) و`docs/SECURITY.md` §10 (نواقص معلنة:
  TOTP يتطلب `totp_secret` migration (غير مُختبر)، rate limiting عند الوكيل، تشديد CSP).
