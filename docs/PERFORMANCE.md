# الأداء (PERFORMANCE)

> ## ⚠️ لم يُتحقق منه / NOT VERIFIED — لا توجد قياسات
> بيئة التوثيق لا تحتوي node/npm/docker/PostgreSQL، لذلك **لم يُقَس أي زمن استجابة
> أو إنتاجية هنا**. كل الأرقام أدناه **أهداف** من المواصفة (10.1) وليست نتائج،
> وأقسام EXPLAIN ANALYZE **placeholders** تُلتقط في بيئة حقيقية
> (انظر `scripts/load-test.md`). لا تُنشَر أي أرقام قبل قياسها فعليًا.

## 1) الأهداف (Spec 10.1)

| المقياس | الهدف (P95) | على بيانات |
|---------|-------------|------------|
| صفحات القوائم (رياضيون/دفعات/حضور…) | < 300ms | seed:load (5,000 رياضي، 50,000 دفعة، 500,000 حضور) |
| لوحة التحكم (Dashboard) | < 800ms | نفس البيانات |
| البحث (q= على القوائم) | < 300ms | نفس البيانات |

**نتيجة القياس: PENDING — لم تُقَس.**

## 2) الفهارس المضافة (من schema.prisma + raw-constraints.sql)

- **فهارس فريدة جزئية** (`WHERE deleted_at IS NULL`): users.email،
  sports.lower(name)، venues.lower(name)، groups.code، athletes.registration_no —
  فهرس أصغر وأسرع من الفهرس الكامل.
- **بحث متسامح:** `athletes_name_trgm_idx` — GIN + `gin_trgm_ops` على
  `(first_name || ' ' || last_name)` (يتطلب pg_trgm؛ التطبيع العربي في
  `shared/text` طبقة تطبيق).
- **الحضور:** `(session_id)`، `(group_id, record_date)`، `(athlete_id, record_date)`
  + فريد `(athlete_id, session_id)`.
- **الحصص:** `(session_date)`، `(group_id, session_date)`،
  `(coach_id, start_time, end_time)`، `(venue_id, start_time, end_time)`، `(series_id)`
  — وقيود EXCLUDE gist نفسها تعمل كفهارس.
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

## 4) EXPLAIN ANALYZE — تُلتقط في بيئة حقيقية (placeholders)

شغّل بعد `npm run seed:load` و`ANALYZE;` والصق المخرجات الخام هنا:

### 4.1 قائمة الرياضيين (ترقيم + فرز)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM athletes WHERE deleted_at IS NULL
ORDER BY created_at DESC LIMIT 25 OFFSET 0;
-- الناتج: PENDING — لم يُلتقط (لا PostgreSQL في بيئة التوثيق)
```

### 4.2 بحث بالاسم (trigram)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM athletes
WHERE deleted_at IS NULL
  AND (first_name || ' ' || last_name) % 'ياسين حمداوي'
LIMIT 25;
-- الناتج: PENDING
```

### 4.3 ورقة حضور مجموعة ضمن شهر

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM attendance_records
WHERE group_id = '<group-uuid>'
  AND record_date BETWEEN '2026-01-01' AND '2026-01-31';
-- الناتج: PENDING
```

### 4.4 دفعات اشتراك (المتبقي)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM payments
WHERE subscription_id = '<sub-uuid>' AND status <> 'VOIDED';
-- الناتج: PENDING
```

### 4.5 مدفوعات فترة (تقارير)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT payment_date, SUM(net_amount) FROM payments
WHERE status = 'COMPLETED' AND payment_date BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY payment_date;
-- الناتج: PENDING
```

### 4.6 مؤشر لوحة التحكم (مثال تجميعي)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM subscriptions WHERE status = 'ACTIVE' AND end_date >= CURRENT_DATE;
-- الناتج: PENDING
```

## 5) ميزانية الأداء وملاحظات

- **قفل استشاري لكل سنة مالية** عند الترقيم (وصولات/حركات) يجعل الدفعات
  المتزامنة لنفس السنة متسلسلة — مقبول بحجم نادٍ؛ راقب زمن الانتظار عند الحمل العالي.
- **قفل صف المجموعة** عند إضافة عضو — نفسه.
- **EXCLUDE gist** يفحص التعارض بتكلفة فهرس نطاق — راقب 4.3/4.6 أعلاه عند نمو
  training_sessions.
- `paid_amount` قيمة مخزنة مشتقة (تسوية دورية reconcile) بدل تجميع في كل قراءة —
  مقايضة سرعة/اتساق مقصودة (ADR/BUSINESS_RULES §1.4).
- قياسات المتصفح (LCP/TTI لصفحات الواجهة) **غير قابلة للقياس أصلًا حاليًا** —
  الواجهة غير مكتملة (PROGRESS المرحلة 11).

## 6) كيف تقيس وتسجل

1. `scripts/load-test.md` (k6/curl/EXPLAIN).
2. الصق المخرجات الخام + التاريخ + مواصفات الجهاز في الأقسام أعلاه.
3. حدّث `docs/FINAL_AUDIT.md` (بند الأداء) بالحالة المقاسة.
