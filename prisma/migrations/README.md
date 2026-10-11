# هجرات Prisma (MySQL/MariaDB) — كيف تُولِّدها ولماذا لا توجد هجرة مكتوبة يدويًا هنا

> **الحالة:** المخطط طُبِّق محليًا على MariaDB 10.11 عبر `npx prisma db push`،
> ولم تُولَّد هجرة مكتوبة بعد (المشروع يستخدم db push محليًا).

## لماذا هذا المجلد فارغ (عمدًا)؟

الهجرة الأولية (`0001_init`) يجب أن يولّدها Prisma نفسه من `prisma/schema.prisma`
حتى تكون مطابقة 100% للمخطط ولإصدارات المحرّك. كتابتها يدويًا قد تنتج ملفًا خاطئًا
أو غير متوافقة مع `_prisma_migrations`. لذلك:

## خطوات التهيئة (بيئة حقيقية)

```bash
# 1) شغّل MySQL/MariaDB (في XAMPP: زر Start لخدمة MySQL)
# 2) أنشئ القاعدة
mysql -u root -e "CREATE DATABASE IF NOT EXISTS sports_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
# 3) DATABASE_URL في .env (انسخ من .env.example) ثم ولّد الهجرة الأولية:
npx prisma migrate dev --name init

# 4) طبّق قيود SQL الخام (CHECK + جدول app_locks)
mysql -u root sports_management < prisma/raw-constraints.sql

# 5) البذر المرجعي
npm run seed
```

### جعل القيود الخام جزءًا من الهجرة (موصى به)

بعد توليد `0001_init`، يمكنك لصق محتوى `prisma/raw-constraints.sql` في نهاية
`0001_init/migration.sql` **قبل** تطبيقها (`prisma migrate dev` مرة أخرى أو
`migrate deploy` على قاعدة نظيفة) حتى تُطبَّق القيود تلقائيًا في كل بيئة.
إذا فعلت ذلك، أبقِ الملف الخام مرجعًا موثقًا واحذف خطوة mysql اليدوية من runbook الخاص بك.

## الإنتاج

```bash
npx prisma migrate deploy          # يطبق الهجرات المولدة فقط (بلا drift)
mysql -u root sports_management < prisma/raw-constraints.sql   # إن لم تُدمج في الهجرة
npm run seed                        # Idempotent — آمن لإعادة التشغيل
```

## ملاحظات

- MySQL لا يعرف `EXCLUDE USING gist` ولا الفهارس الجزئية: كشف تعارض الحصص
  والتفرّد مع الحذف الناعم يطبّقهما الكود (`src/modules/sessions/recurrence.ts`
  وفحوصات الخدمات) مع أقفال `SELECT ... FOR UPDATE`.
- سجل التدقيق Append-Only: لا REVOKE في الإعداد المحلي؛ الحماية الحالية هي غياب
  مسارات UPDATE/DELETE للسجل في `src/modules/audit-logs`. انظر `docs/SECURITY.md`.
- الأقفال التسلسلية: جدول `app_locks` + `lockNamed()` في `src/shared/db/client.ts`.
  انظر ADR-12 وADR-13 في `docs/DECISIONS.md`.
