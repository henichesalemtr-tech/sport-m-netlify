# اختبار التحميل (Load Testing) — دليل التشغيل

> **حالة التحقق / Verification status:** لم يُنفَّذ أي اختبار تحميل في بيئة التوثيق
> (لا يتوفر node/npm/docker/PostgreSQL هنا). الأوامر أدناه جاهزة للتشغيل في بيئة حقيقية،
> وكل النتائج **NOT VERIFIED / لم يُتحقق منها** حتى تُشغَّل فعليًا. انظر `docs/PERFORMANCE.md`.

## 1) تجهيز البيانات (Load Seed)

```bash
npm install
npx prisma migrate dev            # أو migrate deploy للإنتاج-like
psql "$DATABASE_URL" -f prisma/raw-constraints.sql
npm run seed                      # البيانات المرجعية
npm run seed:load                 # 5,000 رياضي / 100 مجموعة / 50,000 دفعة / 500,000 حضور
psql "$DATABASE_URL" -c "ANALYZE;"
```

الأحجام قابلة للضبط: `LOAD_ATHLETES`, `LOAD_GROUPS`, `LOAD_PAYMENTS`, `LOAD_ATTENDANCE`.

## 2) تشغيل التطبيق

```bash
npm run build
NODE_ENV=production npm run start   # أو npm run dev (أبطأ — لا يُقاس عليه)
```

## 3) أهداف القياس (من المواصفة 10.1)

| الصفحة/العملية            | الهدف (P95)        |
| ------------------------- | ------------------ |
| صفحات القوائم (رياضيون…)  | < 300ms            |
| لوحة التحكم (Dashboard)   | < 800ms            |
| البحث (على بيانات seed:load) | < 300ms         |

## 4) أدوات مقترحة

### أ) k6 (خارج المشروع — يثبَّت منفصلًا)

مثال سيناريو `k6-list.js` (يُعدّل ليناسب مسار تسجيل الدخول الفعلي):

```js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    list_athletes: {
      executor: 'ramping-arrival-rate',
      startRate: 5, timeUnit: '1s',
      stages: [
        { target: 20, duration: '1m' },
        { target: 20, duration: '3m' },
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: { http_req_duration: ['p(95)<300'] },
};

const BASE = __ENV.BASE_URL ?? 'http://localhost:3000';
const COOKIE = __ENV.SESSION_COOKIE; // انسخ كوكي sms_session من جلسة مسجلة دخول

export default function () {
  const res = http.get(`${BASE}/api/v1/athletes?page=1&pageSize=25`, {
    headers: { Cookie: `sms_session=${COOKIE}` },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

```bash
k6 run -e SESSION_COOKIE="<كوكي جلسة صالحة>" k6-list.js
```

### ب) قياس يدوي سريع (curl)

```bash
COOKIE="sms_session=<token>"
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{time_total}\n" \
    -H "Cookie: $COOKIE" \
    "http://localhost:3000/api/v1/athletes?page=1&pageSize=25"
done | sort -n | awk '{a[NR]=$1} END {print "P95:", a[int(NR*0.95)]}'
```

### ج) EXPLAIN ANALYZE للاستعلامات الحرجة

```bash
psql "$DATABASE_URL" -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM athletes WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 25;"
psql "$DATABASE_URL" -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM attendance_records WHERE group_id = '<uuid>' AND record_date BETWEEN '2026-01-01' AND '2026-01-31';"
psql "$DATABASE_URL" -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM payments WHERE subscription_id = '<uuid>' AND status <> 'VOIDED';"
```

> لا توجد مخرجات EXPLAIN ANALYZE موثقة في هذا المستودع لأنها تتطلب قاعدة بيانات حقيقية —
> تُلتقط في بيئة المستخدم وتُلصق في `docs/PERFORMANCE.md` (الأماكن المخصصة لها معلَّمة بوضوح).

## 5) التنظيف

```bash
# بيانات seed-load كلها ببادئة LOAD- — لحذفها:
psql "$DATABASE_URL" <<'SQL'
DELETE FROM attendance_records WHERE session_id IN (SELECT id FROM training_sessions WHERE title LIKE 'LOAD-%');
DELETE FROM training_sessions WHERE title LIKE 'LOAD-%';
DELETE FROM payments WHERE transaction_no LIKE 'LOAD-%';
DELETE FROM subscriptions WHERE athlete_id IN (SELECT id FROM athletes WHERE registration_no LIKE 'LOAD-%');
DELETE FROM group_members WHERE athlete_id IN (SELECT id FROM athletes WHERE registration_no LIKE 'LOAD-%');
DELETE FROM athletes WHERE registration_no LIKE 'LOAD-%';
DELETE FROM groups WHERE code LIKE 'LOAD-%';
DELETE FROM payment_methods WHERE name LIKE 'LOAD-%';
DELETE FROM subscription_types WHERE name LIKE 'LOAD-%';
DELETE FROM sports WHERE name LIKE 'LOAD-%';
SQL
```
