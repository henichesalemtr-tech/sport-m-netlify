-- ============================================================
-- قيود إضافية لا يعبّر عنها Prisma أصليًا — نسخة MySQL/MariaDB
-- تُطبَّق بعد إنشاء الجداول:
--   mysql -u root -P 3306 sports_management < prisma/raw-constraints.sql
--
-- فروقات عن نسخة PostgreSQL السابقة (مقصودة، انظر docs/DATABASE_SCHEMA.md):
--   - لا EXCLUDE USING gist في MySQL ⇒ كشف تعارض الحصص (المدرب/القاعة/المجموعة)
--     يُطبَّق في طبقة التطبيق: src/modules/sessions/recurrence.ts + service.ts
--     (يرفض الطلب برسالة SESSION_CONFLICT)، ويُقفل التسلسل بقفل صف المجموعة.
--   - لا فهارس جزئية WHERE deleted_at IS NULL ⇒ uniqueness مع الحذف الناعم
--     تُتحقق منها الخدمة قبل الإدراج (findByName / findByEmail ...).
--   - الترتيب غير الحساس لحالة الأحرف يأتي من Collation:
--     أنشئ القاعدة بـ utf8mb4_unicode_ci (مثال README) فيكفي contains/equals.
-- ============================================================

-- ---------- 1) قيود CHECK للسلامة المالية والمنطقية ----------
-- MariaDB ≥ 10.2 و MySQL ≥ 8.0.16 تطبّق CHECK فعليًا.
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_dates_chk CHECK (end_date >= start_date),
  ADD CONSTRAINT subscriptions_non_negative_chk
    CHECK (price >= 0 AND net_amount >= 0 AND paid_amount >= 0 AND sessions_used >= 0);

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive_chk CHECK (amount > 0);

ALTER TABLE expenses
  ADD CONSTRAINT expenses_amount_positive_chk CHECK (amount > 0);

ALTER TABLE `groups`
  ADD CONSTRAINT groups_capacity_chk CHECK (max_capacity >= 0);

ALTER TABLE age_categories
  ADD CONSTRAINT age_categories_range_chk
    CHECK (max_age IS NULL OR min_age IS NULL OR max_age >= min_age);

-- ---------- 2) جدول أقفال المعاملات ----------
-- بديل pg_advisory_xact_lock: صف واحد لكل قفل مسمّى يُقفل بـ SELECT ... FOR UPDATE
-- (يُنشأ عند الحاجة بواسطة src/shared/db/client.ts :: lockNamed).
CREATE TABLE IF NOT EXISTS app_locks (
  name VARCHAR(64) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 3) سجل التدقيق: Append-Only ----------
-- في MySQL لا يمكن سحب UPDATE/DELETE من نفس مستخدم التطبيق دون كسر Prisma.
-- الحماية الفعلية: لا توجد مسارات تحديث/حذف لسجل التدقيق في src/modules/audit-logs،
-- والصلاحيات محصورة في Super Admin. إن أردت عزلًا إضافيًا أنشئ دورًا SQLيًا منفصلًا.
