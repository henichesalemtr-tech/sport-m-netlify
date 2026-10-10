# التدقيق النهائي (FINAL_AUDIT)

> **قاعدة الأمانة:** لا ✔ على أي سلوك يتطلب تشغيلًا. كل بند إما
> **"كود موجود (غير مُتحقَّق تشغيليًا) — Code present, NOT runtime-verified"** مع
> ملفات الدليل، أو **"PENDING بيئة حقيقية"**. بيئة التدقيق لا تحتوي
> node/npm/docker/PostgreSQL — لم يُبنَ أو يُشغَّل أو يُختبر أي شيء هنا (انظر PROGRESS).

## أ) المعمارية والكود

| ✔/الحالة | البند | الدليل |
|----------|-------|--------|
| كود موجود (غير مُتحقَّق تشغيليًا) | فصل الطبقات route→service→repository | `docs/CONVENTIONS.md` + أي وحدة في `src/modules/*` |
| كود موجود | غلاف API موحّد (requestId، أخطاء، pagination) | `src/shared/api/route.ts` |
| كود موجود | TypeScript strict بلا any مقصود | `tsconfig.json` (`"strict": true`) — **التحقق الفعلي PENDING** (`npm run typecheck`) |
| كود موجود | أكواد أخطاء موحدة → HTTP | `src/shared/errors/index.ts` |
| كود موجود | env fail-fast | `src/shared/config/env.ts` |
| PENDING | البناء الناجح (`npm run build`) | لم يُنفَّذ — لا node |

## ب) قاعدة البيانات

| الحالة | البند | الدليل |
|--------|-------|--------|
| كود موجود | مخطط كامل (30+ جدولًا، BigInt للمال، timestamptz، soft delete، version) | `prisma/schema.prisma` |
| كود موجود (SQL) | EXCLUDE gist × 3 (مدرب/قاعة/مجموعة) | `prisma/raw-constraints.sql` §3 |
| كود موجود (SQL) | فهارس فريدة جزئية WHERE deleted_at IS NULL | نفسه §1 |
| كود موجود (SQL) | CHECK مالية/منطقية | نفسه §4 |
| موثق — تنفيذ يدوي | REVOKE UPDATE/DELETE على audit_logs | نفسه §5 + `prisma/migrations/README.md` |
| PENDING | توليد الهجرة (`prisma migrate dev`) وتطبيق كل ما سبق | لا postgres هنا |

## ج) الأمان

| الحالة | البند | الدليل |
|--------|-------|--------|
| كود موجود | Argon2id | `src/shared/auth/password.ts` |
| كود موجود | جلسات DB (تجزئة رمز، idle+absolute، إبطال) | `src/shared/auth/session.ts`، `sessions` |
| كود موجود | قفل brute-force (5/15د) + LOGIN_FAILED في Audit | `src/modules/auth/service.ts` |
| ✅ منفّذ/غير متحقق | TOTP — تحقق زمني حقيقي (otplib) مع سر مشفّر AES-256-GCM + تدفق تفعيل/تعطيل | `src/shared/auth/totp.ts`، `src/modules/auth/service.ts` — يتطلب `totp_secret` migration، **UNVERIFIED** |
| كود موجود | requirePermission في كل route (95) | `src/app/api/v1/**/route.ts` |
| كود موجود | LAST_SUPER_ADMIN | `src/modules/users/service.ts` |
| كود موجود | Magic bytes + تخزين خاص خارج public | `src/shared/storage/index.ts` |
| كود موجود | تعقيم CSV injection + BOM | `src/shared/export/csv.ts` |
| كود موجود | ترويسات أمان + CSP + HSTS | `next.config.js` |
| كود موجود | الحقول الطبية خلف view_sensitive | `src/modules/athletes/service.ts` (stripAthlete) |
| PENDING | اختبار اختراقي + npm audit + rate limiting بالوكيل | SECURITY §10 |

## د) قواعد العمل المالية

| الحالة | البند | الدليل |
|--------|-------|--------|
| كود موجود | BigInt minor units + تقريب خصم مرة واحدة (لأسفل) | `src/shared/money/index.ts` |
| كود موجود | remaining = net − غير الملغاة + إعادة اشتقاق paidAmount داخل المعاملة | `payments/service.ts`، `subscriptions/logic.ts` |
| كود موجود | منع overpay افتراضيًا (409) | `payments/service.ts` |
| كود موجود | ذرّية الدفعة (دفعة+خزينة+وصل+Audit في transaction) | `payments/service.ts` |
| كود موجود | وصولات gapless (قفل استشاري + unique(fiscal_year,sequence) + دوال كشف الفجوات) | `receipts/logic.ts`، `receipts/service.ts` |
| كود موجود | void/refund بأسباب + REVERSAL في الخزينة | `payments/service.ts`، `cash/logic.ts` |
| كود موجود | انتقالات الاشتراك + منع التداخل + تجديد بلا مسح | `subscriptions/logic.ts`، `service.ts` |
| كود موجود | السعة بقفل صف + override بسبب + Audit | `groups/service.ts`، `groups/capacityRules.ts` |
| كود موجود | حضور فريد + تأخر + استهلاك/عكس الحصص + غياب متتابع + نافذة تعديل | `attendance/service.ts`، `absenceRules.ts` |
| كود موجود | مسح HMAC + dedup | `scan/service.ts` |
| كود موجود | إقفال يومي + فرق + سبب | `cash/service.ts`، `cash/logic.ts` |
| PENDING | اختبارات التزامن الفعلية (TESTING §4) | لا postgres |

## هـ) التشغيل

| الحالة | البند | الدليل |
|--------|-------|--------|
| كود موجود | 5 مهام مجدولة + أقفال JobRun + استرداد المنقطعة | `src/jobs/*` |
| كود موجود | نسخ pg_dump -Fc + checksum + GFS retention + استعادة آمنة (pre-restore backup + صيانة + RESTORE) | `src/modules/backups/service.ts`، `retention.ts` |
| كود موجود | CLI: seed / seed-demo (يرفض production) / seed-load / backup / restore / worker | `scripts/*` — **لم تُشغَّل** |
| كود موجود | Dockerfile + compose (db/app/worker/proxy) | `docker/`، `docker-compose.yml` — **لم تُبنَ** |
| كود موجود | استيراد CSV/Excel بخطوات (mapping/preview/errors/confirm) | `src/modules/imports/` |
| كود موجود | تقارير (14 نوعًا) + تصدير | `src/modules/reports/` |

## و) الجودة والوثائق

| الحالة | البند | الدليل |
|--------|-------|--------|
| كود موجود (لم يُشغَّل) | 14 ملف اختبار نقي | `src/modules/*/**.test.ts`، `src/shared/export/export.test.ts` |
| PENDING | `npm run test` + coverage بأرقام حقيقية | TESTING.md §5 |
| PENDING | E2E (دورة 25 خطوة) — playwright.config موجود لكن الـ UI غير مكتمل | TESTING.md §3 |
| ✅ (كتابيًا) | حزمة الوثائق الكاملة (15 وثيقة + README) | `docs/` |
| PENDING | قياسات الأداء (P95) + EXPLAIN ANALYZE | PERFORMANCE.md §4 |

## ز) النواقص المعلنة (لا تُخفى)

1. ~~الواجهة غير مكتملة~~ **اكتملت**: شاشات + صفحات توجيه لكل الوحدات تحت `src/app/[locale]/(app)` — **UNVERIFIED (لم يُبنَ/يُشغَّل)**.
2. ~~TOTP Stub~~ **مُنفّذ الآن** (otplib + سر مشفّر AES-256-GCM + تدفق تفعيل/تعطيل) — يتطلب `totp_secret` migration، **UNVERIFIED**.
3. **لا هجرة Prisma مولدة** — على المستخدم توليدها (migrations/README).
4. **REVOKE على audit_logs** خطوة يدوية لم تُنفَّذ في أي بيئة بعد.
5. **لا rate limiting داخل التطبيق** (يُنصح nginx limit_req).
6. **مسار PDF للوصولات** يعيد HTML حاليًا — التحويل headless غير منفذ (ADR-8).
7. **كل شيء غير مُصرَّف/غير مُشغَّل** — أول خطوة في بيئة حقيقية:
   `npm install && npm run typecheck` ثم باقي TESTING §5.
