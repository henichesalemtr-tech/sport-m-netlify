-- ============================================================
-- قيود إضافية لا يعبّر عنها Prisma أصليًا
-- تُنفَّذ بعد إنشاء الجداول (ضمن هجرة Prisma أو يدويًا):
--   psql "$DATABASE_URL" -f prisma/raw-constraints.sql
-- انظر docs/DATABASE_SCHEMA.md
-- ============================================================

-- يتطلب إضافة btree_gist لكشف التعارض على الموارد
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- للبحث العربي/اللاتيني المتسامح

-- ---------- 1) فهارس جزئية تتجاهل السجلات المحذوفة (Soft Delete) ----------
CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_uq
  ON users (email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sports_name_active_uq
  ON sports (lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS venues_name_active_uq
  ON venues (lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS groups_code_active_uq
  ON groups (code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS athletes_reg_active_uq
  ON athletes (registration_no) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS parents_phone_active_idx
  ON parents (phone) WHERE deleted_at IS NULL;

-- ---------- 2) فهارس البحث (تطبيع النص العربي يتم في طبقة التطبيق) ----------
CREATE INDEX IF NOT EXISTS athletes_name_trgm_idx
  ON athletes USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- ---------- 3) كشف تعارض الحصص لثلاثة موارد (7.7) ----------
-- نطاق زمني [startTime, endTime) — يُستثنى الملغى/المحذوف
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE training_sessions
  ADD CONSTRAINT sessions_coach_no_overlap
  EXCLUDE USING gist (
    coach_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (coach_id IS NOT NULL AND status <> 'CANCELLED' AND deleted_at IS NULL);

ALTER TABLE training_sessions
  ADD CONSTRAINT sessions_venue_no_overlap
  EXCLUDE USING gist (
    venue_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (venue_id IS NOT NULL AND status <> 'CANCELLED' AND deleted_at IS NULL);

ALTER TABLE training_sessions
  ADD CONSTRAINT sessions_group_no_overlap
  EXCLUDE USING gist (
    group_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (group_id IS NOT NULL AND status <> 'CANCELLED' AND deleted_at IS NULL);

-- ---------- 4) قيود CHECK للسلامة المالية والمنطقية ----------
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_dates_chk CHECK (end_date >= start_date),
  ADD CONSTRAINT subscriptions_non_negative_chk
    CHECK (price >= 0 AND net_amount >= 0 AND paid_amount >= 0 AND sessions_used >= 0);

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive_chk CHECK (amount > 0);

ALTER TABLE expenses
  ADD CONSTRAINT expenses_amount_positive_chk CHECK (amount > 0);

ALTER TABLE groups
  ADD CONSTRAINT groups_capacity_chk CHECK (max_capacity >= 0);

ALTER TABLE age_categories
  ADD CONSTRAINT age_categories_range_chk
    CHECK (max_age IS NULL OR min_age IS NULL OR max_age >= min_age);

-- ---------- 5) Audit Log — Append-Only (6.5) ----------
-- نسحب صلاحية UPDATE/DELETE من دور التطبيق (عدّل اسم الدور حسب إعدادك)
-- يُنفَّذ يدويًا لأن Prisma لا يدير الصلاحيات:
-- DO $$ BEGIN
--   REVOKE UPDATE, DELETE ON audit_logs FROM sms_app;
-- END $$;

-- ---------- 6) دالة updated_at تلقائية (اختياري — Prisma يديرها أيضًا) ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
