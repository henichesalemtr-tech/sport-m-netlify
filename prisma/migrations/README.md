# هجرات Prisma — كيف تُولِّدها ولماذا لا توجد هجرة مكتوبة يدويًا هنا

> **لم يُتحقق منه / NOT VERIFIED:** بيئة التوثيق لا تحتوي node/npm/docker/PostgreSQL،
> لذا لم يُنفَّذ `prisma migrate dev` ولم تُولَّد أي هجرة هنا.

## لماذا هذا المجلد فارغ (عمدًا)؟

الهجرة الأولية (`0001_init`) يجب أن يولّدها Prisma نفسه من `prisma/schema.prisma`
حتى تكون مطابقة 100% للمخطط ولإصدارات المحرّك. كتابتها يدويًا قد تنتج ملفًا خاطئًا
أو غير متوافقة مع `_prisma_migrations`. لذلك:

## خطوات التهيئة (بيئة حقيقية)

```bash
# 1) تأكد من وجود DATABASE_URL في .env (انسخ من .env.example)
# 2) ولّد الهجرة الأولية
npx prisma migrate dev --name init

# 3) طبّق قيود SQL الخام (EXCLUDE gist، الفهارس الجزئية، pg_trgm، btree_gist)
psql "$DATABASE_URL" -f prisma/raw-constraints.sql

# 4) (اختياري لكن موصى به للإنتاج) اسحب صلاحيات UPDATE/DELETE على audit_logs
#    من دور التطبيق — عدّل الاسم sms_app ليطابق دور قاعدة بياناتك:
psql "$DATABASE_URL" -c "REVOKE UPDATE, DELETE ON audit_logs FROM sms_app;"

# 5) البذر المرجعي
npm run seed
```

### جعل القيود الخام جزءًا من الهجرة (موصى به)

بعد توليد `0001_init`، يمكنك لصق محتوى `prisma/raw-constraints.sql` في نهاية
`0001_init/migration.sql` **قبل** تطبيقها (`prisma migrate dev` مرة أخرى أو
`migrate deploy` على قاعدة نظيفة) حتى تُطبَّق القيود تلقائيًا في كل بيئة.
إذا فعلت ذلك، أبقِ الملف الخام مرجعًا موثقًا واحذف خطوة psql اليدوية من runbook الخاص بك.

## الإنتاج

```bash
npx prisma migrate deploy          # يطبق الهجرات المولدة فقط (بلا drift)
psql "$DATABASE_URL" -f prisma/raw-constraints.sql   # إن لم تُدمج في الهجرة
npm run seed                        # Idempotent — آمن لإعادة التشغيل
```

## ملاحظات

- قيود `EXCLUDE USING gist` تتطلب إضافة `btree_gist` (ينشئها ملف SQL الخام).
- دور قاعدة البيانات الذي ينفّذ `REVOKE` يجب أن يكون مختلفًا عن دور التطبيق
  (وإلا سحب التطبيق الصلاحيات عن نفسه). انظر `docs/SECURITY.md` و`docs/DEPLOYMENT.md`.
- SQLite غير مدعوم من هذه القيود — التطوير عليه (إن اضطررت) يعني غياب ضمانات
  تعارض الحصص والفهارس الجزئية. انظر `docs/ASSUMPTIONS.md` و`docs/DECISIONS.md`.
