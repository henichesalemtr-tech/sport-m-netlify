# الأداء (PERFORMANCE)

> ## ⚠️ لم يُتحقق منه / NOT VERIFIED — لا توجد قياسات
> **لم يُقَس أي زمن استجابة أو إنتاجية** — لا في بيئة التوثيق القديمة ولا بعد الانتقال إلى
> MySQL/MariaDB المحلية (ADR-13). كل الأرقام أدناه **أهداف** من المواصفة (10.1) وليست نتائج،
> وأقسام `ANALYZE FORMAT=JSON` **placeholders** تُلتقط في بيئة حقيقية
> (انظر `scripts/load-test.md`). ما شُغِّل فعليًا على MariaDB (أكتوبر 2026) هو: `prisma db push`
> + `prisma/raw-constraints.sql` + `seed`/`seed:demo` + 180 اختبار وحدة — بلا أي قياس حمل.
> لا تُنشَر أي أرقام قبل قياسها فعليًا.

## 1) الأهداف (Spec 10.1)

| المقياس | الهدف (P95) | على بيانات |
|---------|-------------|------------|
| صفحات القوائم (رياضيون/دفعات/حضور…) | < 300ms | seed:load (5,000 رياضي، 50,000 دفعة، 500,000 حضور) |
| لوحة التحكم (Dashboard) | < 800ms | نفس البيانات |
| البحث (q= على القوائم) | < 300ms | نفس البيانات |

**نتيجة القياس: PENDING — لم تُقَس.**

## 2) الفهارس المضافة (من schema.prisma + raw-constraints.sql)

- **فهارس فريدة عادية (لا جزئية — MySQL لا يعرف الفهارس الجزئية):** users.email،
  groups.code، athletes.registration_no — والتفرّد **الواعي بالحذف الناعم**
  (`WHERE deleted_at IS NULL`) يُتحقق منه في طبقة الخدمة قبل الإدراج، لا في الفهرس.
- **أسماء المرجعيات:** `sports(name)` و`venues(name)` و`age_categories(name)` فهارس
  btree عادية غير فريدة (كانت فهارس `lower(name)` جزئية في PostgreSQL)؛ مطابقة
  عدم حساسية الحالة تأتي من Collation `utf8mb4_unicode_ci`.
- **بحث متسامح:** لا `pg_trgm` ولا فهرس GIN في MySQL؛ البحث عبر `contains` على
  `first_name`/`last_name` مع تطبيع عربي في التطبيق (`normalizeArabic`
  في `src/shared/text/normalize.ts`) وحالة-حرف محايدة من Collation
  `utf8mb4_unicode_ci`؛ الفهرس المستخدم `athletes(firstName, lastName)` (btree عادي).
  ملاحظة: `contains` مع `%q%` لا يستخدم فهرس btree — البحث النصي غير مقيس (PENDING).
- **الحضور:** `(session_id)`، `(group_id, record_date)`، `(athlete_id, record_date)`
  + فريد `(athlete_id, session_id)`.
- **الحصص:** `(session_date)`، `(group_id, session_date)`،
  `(coach_id, start_time, end_time)`، `(venue_id, start_time, end_time)`، `(series_id)`
  — هذه الفهارس تستخدمها استعلامات كشف التعارض في طبقة التطبيق (`FOR UPDATE` على
  صفوف المدرب/القاعة/المجموعة)؛ لم يعد هناك قيد EXCLUDE gist يعمل كفهرس نطاق.
- **المال:** payments `(athlete_id)`، `(subscription_id, status)`، `(payment_date)`؛
  subscriptions `(athlete_id, status)`، `(sport_id, status)`، `(due_date)`، `(end_date)`؛
  expenses `(expense_date)`، `(category_id)`؛ cash_transactions `(tx_date)`، `(type)`،
  `(reference_type, reference_id)`.
- **أخرى:** audit_logs `(entity_type, entity_id)`، `(user_id)`، `(created_at)`،
  `(action)`؛ notifications `(user_id, is_read)`؛ sessions `(user_id)`، `(expires_at)`؛
  evaluations `(athlete_id, evaluation_date)`.

## 3) تجنّب N+1 وأنماط الاستعلام

- الـ Repository يستخدم `include`/`select` موجهًا (مثل قوائم الرياضيين مع الأولياء
  والاشتراك النشط في استعلام واحد) — **لا حلقات استعلام داخل قوائم**؛
  يُرجى تدقيق ذلك أثناء اختبارات الأداء الفعلية (PENDING).
- القوائم مرقّمة دائمًا (`pageSize ≤ 100` عبر listQuerySchema) — لا تحميل جداول كاملة.
- العدّادات (total) عبر `count` في نفس استعلام القائمة (نمط `list()` الموحّد).
- الصادرات الكبيرة عبر Streaming (CSV ReadableStream / exceljs streaming).
- صلاحيات الطلب تُجمع مرة واحدة لكل طلب (كاش ذاكرة داخل الطلب في guard).
- المهام الدورية تعمل بالدفعات (`chunk` في jobs/runner) لا بصف-بصف.

## 4) `ANALYZE FORMAT=JSON` — تُلتقط في بيئة حقيقية (placeholders)

شغّل بعد `npm run seed:load` و`mysql -u root sports_management -e "ANALYZE TABLE athletes, payments, attendance_records;"`
والصق المخرجات الخام هنا. الصيغة المستعملة في MariaDB: `ANALYZE FORMAT=JSON SELECT ...`
(لا خيار `BUFFERS` كما في `EXPLAIN (ANALYZE, BUFFERS)` في PostgreSQL).

### 4.1 قائمة الرياضيين (ترقيم + فرز)

```sql
ANALYZE FORMAT=JSON
SELECT * FROM athletes WHERE deleted_at IS NULL
ORDER BY created_at DESC LIMIT 25 OFFSET 0;
-- الناتج: PENDING — لم يُلتقط (لا قياسات على MariaDB حتى الآن)
```

### 4.2 بحث بالاسم (تطبيع في التطبيق + `LIKE`)

لا `pg_trgm` في MySQL: البحث في التطبيق عبر `contains` على `first_name`/`last_name`
بعد `normalizeArabic`، أو بعمود مولّد (generated column) على `CONCAT(first_name, ' ', last_name)`
إن لزم — وكلاهما **غير مقيس بعد**.

```sql
ANALYZE FORMAT=JSON
SELECT * FROM athletes
WHERE deleted_at IS NULL
  AND (first_name LIKE '%ياسين%' OR last_name LIKE '%حمداوي%')
LIMIT 25;
-- الناتج: PENDING
```

### 4.3 ورقة حضور مجموعة ضمن شهر

```sql
ANALYZE FORMAT=JSON
SELECT * FROM attendance_records
WHERE group_id = '<group-uuid>'
  AND record_date BETWEEN '2026-01-01' AND '2026-01-31';
-- الناتج: PENDING
```

### 4.4 دفعات اشتراك (المتبقي)

```sql
ANALYZE FORMAT=JSON
SELECT * FROM payments
WHERE subscription_id = '<sub-uuid>' AND status <> 'VOIDED';
-- الناتج: PENDING
```

### 4.5 مدفوعات فترة (تقارير)

```sql
ANALYZE FORMAT=JSON
SELECT payment_date, SUM(net_amount) FROM payments
WHERE status = 'COMPLETED' AND payment_date BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY payment_date;
-- الناتج: PENDING
```

### 4.6 مؤشر لوحة التحكم (مثال تجميعي)

```sql
ANALYZE FORMAT=JSON
SELECT count(*) FROM subscriptions WHERE status = 'ACTIVE' AND end_date >= CURRENT_DATE;
-- الناتج: PENDING
```

## 5) ميزانية الأداء وملاحظات

- **قفل `app_locks` لكل سنة مالية** (`lockNamed()` + `SELECT ... FOR UPDATE`) عند الترقيم
  (وصولات/حركات) يجعل الدفعات المتزامنة لنفس السنة متسلسلة — مقبول بحجم نادٍ؛
  راقب زمن الانتظار عند الحمل العالي (لم يُقس).
- **قفل صف المجموعة** عند إضافة عضو — نفسه.
- **كشف تعارض الحصص في طبقة التطبيق** (استعلام نطاق على `(coach_id, start_time, end_time)`
  و`(venue_id, ...)` و`(group_id, session_date)` + `FOR UPDATE`) حلّ محل قيد EXCLUDE gist؛
  كلفته مقابل الفهرس النطاقي السابق **لم تُقَس** — راقب 4.3/4.6 أعلاه عند نمو training_sessions.
- `paid_amount` قيمة مخزنة مشتقة (تسوية دورية reconcile) بدل تجميع في كل قراءة —
  مقايضة سرعة/اتساق مقصودة (ADR/BUSINESS_RULES §1.4).
- قياسات المتصفح (LCP/TTI لصفحات الواجهة) **غير قابلة للقياس أصلًا حاليًا** —
  الواجهة غير مكتملة (PROGRESS المرحلة 11).

## 6) كيف تقيس وتسجل

1. `scripts/load-test.md` (k6/curl/`ANALYZE FORMAT=JSON` على MariaDB).
2. الصق المخرجات الخام + التاريخ + مواصفات الجهاز في الأقسام أعلاه.
3. حدّث `docs/FINAL_AUDIT.md` (بند الأداء) بالحالة المقاسة.
