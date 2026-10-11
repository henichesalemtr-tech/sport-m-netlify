# استراتيجية الاختبار (TESTING)

> ## ✅ شُغِّل هذا فعليًا على MariaDB — النتائج في §5.5
> **تاريخيًا** (2026-10-10) نُفِّذت سلسلة التحقق الكاملة على Node v24.18.0 + PostgreSQL 16 (Neon).
> المشروع انتقل إلى MySQL/MariaDB (ADR-13 في `docs/DECISIONS.md`)، و**أُعيد تنفيذ السلسلة
> كاملةً على MariaDB 10.11 المحلية (`sports_management`) في 2026-10-11**:
> `typecheck` (0 أخطاء) · `lint -- --max-warnings=0` (بلا تحذيرات) · `npx vitest run`
> (**18 ملفًا / 180 اختبارًا**) · `NODE_ENV=production npx next build` (exit 0) ·
> `npx playwright test` (**66/66** عبر 6 مشاريع مقاسات) · `seed`/`seed:demo` ·
> `backup`/`restore`/`worker --once`.
> **NOT VERIFIED / لم تُشغَّل:** اختبارات التكامل على قاعدة اختبار (§1 و§4 — التزامن تحت
> ضغط متوازٍ)، `npm run test:coverage` بأرقام موثقة، دورة الـ25 خطوة كاملة كاختبار آلي واحد،
> `seed:load` والأحمال وقياسات P95/`EXPLAIN FORMAT=JSON`، تدفق 2FA الحيّ عبر UI (وحدوي فقط)،
> Docker، وقاعدة متصفح offline-first + المزامنة السحابية (غير منفّذة أصلًا).
> الأوامر الجاهزة للتكرار في §5.

## 1) الاستراتيجية (3 مستويات)

| المستوى | الأداة | النطاق |
|---------|--------|--------|
| Unit | Vitest (`*.test.ts` جنبًا إلى جنب مع الوحدات) | منطق نقي: المال (`shared/money`)، التواريخ/العمر/السنة المالية (`shared/dates`)، حالات الاشتراك (`subscriptions/logic.ts`)، الاحتفاظ بالنسخ (`backups/retention.ts`)، تعقيم CSV (`shared/export`)، استنتاج الفئات العمرية، قواعد الخزينة (`cash/logic.ts`)، إشعارات dedupe، أرقام التسجيل |
| Integration | Vitest على **MySQL/MariaDB حقيقية** (إعادة تشغيلها على MariaDB لم تُتحقق بعد) | الخدمات كاملة: ذرّية الدفع (دفعة+خزينة+وصل+Audit)، Idempotency، منع تجاوز السعة تحت التزامن، كشف تعارض الحصص في طبقة التطبيق، تسلسل الوصلات بلا فجوات، انتقالات الاشتراك، قفل version/409 |
| E2E | Playwright (`playwright.config.ts` موجود) | المُنفَّذ: دخان + سلاسل حرجة (دخول/UI، دورة مالية، صلاحيات، أمان، معالج استيراد) عبر 6 مشاريع مقاسات — ✅ 66/66 على MariaDB (2026-10-11). الهدف الموثّق (الدورة الكاملة أدناه — 25 خطوة) لم يُغطَّ كله |

ملاحظة: `vitest.config.ts` و`playwright.config.ts` موجودان في المستودع، وتوجد ملفات
اختبار فعلية مثل `src/modules/subscriptions/subscriptions.test.ts`،
`src/modules/cash/cash.test.ts`، `src/modules/dashboard/dashboard.test.ts`،
`src/modules/notifications/notifications.test.ts`، `src/shared/export/export.test.ts`،
`src/modules/imports/imports.test.ts` (جديد — 9 اختبارات لتحقق صفوف استيراد الرياضيين) —
**اختبارات E2E أُعيد تشغيلها على MariaDB (2026-10-11): 66/66**، بينما **اختبارات التكامل
على قاعدة اختبار ما زالت لم تُعَد تشغيلها على MariaDB.**

## 2) أهداف التغطية (Targets — ليست نتائج)

- المنطق المالي والتواريخ وحالات الاشتراك: **100%** من الدوال النقية (فرض إلزامي).
- الخدمات المالية (payments/subscriptions/cash/receipts): **≥ 90%** فروع.
- بقية الخدمات: **≥ 75%** عبارات.
- E2E: دورة العمل الكاملة (القسم 3) ناجحة من الطرف للطرف.
- تُقاس بـ `npm run test:coverage` — **النتيجة الحالية: غير مقاسة (NOT VERIFIED)**.

## 3) قائمة الدورة الكاملة E2E (المواصفة 11.3 — 25 خطوة)

نفّذها يدويًا أو كسيناريو Playwright بعد `npm run seed && npm run seed:demo`.
علّم كل خطوة بعد التحقق الفعلي — القائمة أدناه **ليست مُعلَّمة خطوة بخطوة**؛ السلاسل الحرجة
منها مُغطّاة آليًا في مشاريع E2E (دخول/UI، دورة مالية، صلاحيات، أمان، معالج استيراد) وبشكل
يدوي في المتصفح (دخول، لوحة ببيانات حقيقية، بطاقة طباعة الرياضي)، والباقي لم يُتحقق منه فرديًا:

- [ ] 1. التهيئة: migrate + raw-constraints.sql + seed (صلاحيات/أدوار/مرجعيات/إعدادات)
- [ ] 2. إنشاء أول Super Admin والدخول (وتغيير كلمة المرور الإلزامي)
- [ ] 3. ضبط الإعدادات: اسم المنظمة، العملة DZD/خانتان، Africa/Algiers، بداية السنة المالية 9
- [ ] 4. إنشاء نشاط رياضي + فئات عمرية (والتحقق من اقتراح الفئة من تاريخ الميلاد)
- [ ] 5. إنشاء قاعة/ملعب بسعة
- [ ] 6. إنشاء مدربَين وربط أحدهما بحساب مستخدم COACH
- [ ] 7. إنشاء مجموعة (سعة 20، أيام/أوقات) والتحقق من فريدية code
- [ ] 8. إنشاء وليّ وربطه، والتحقق من تحذير تكرار الهاتف
- [ ] 9. إنشاء رياضيَين (أرقام تسجيل تسلسلية تلقائية، كشف تكرار الاسم+تاريخ الميلاد)
- [ ] 10. رفع وثيقة (شهادة طبية) والتحقق من رفض نوع ملف غير مسموح (Magic Bytes)
- [ ] 11. إضافة الرياضي للمجموعة — والتحقق من رفض الإضافة عند امتلاء السعة
- [ ] 12. تجاوز السعة بصلاحية `groups.override_capacity` + سبب — والتحقق من Audit
- [ ] 13. إنشاء نوع اشتراك شهري (2000.00) ونوع 10 حصص
- [ ] 14. إنشاء اشتراك والتحقق من منع اشتراك نشط ثانٍ لنفس الرياضي/النشاط
- [ ] 15. إنشاء اشتراك بخصم 10% والتحقق من إلزامية السبب وحساب الصافي (1800.00)
- [ ] 16. توليد حصص متكررة للمجموعة والتحقق من رفض تعارض المدرب/القاعة (كشف في طبقة التطبيق)
- [ ] 17. تسجيل دفعة 900.00 (Idempotency-Key) — إعادة الإرسال لا تضاعف الدفعة
- [ ] 18. التحقق من الوصل: رقم تسلسلي بلا فجوات للسنة المالية، والقيود: متبقي 900.00
- [ ] 19. محاولة دفع 1000.00 إضافية ⇒ رفض OVERPAYMENT (المتبقي 900) ما لم يُفعَّل allowOverpay
- [ ] 20. إلغاء دفعة (void) بسبب — والتحقق من إعادة اشتقاق paidAmount/المتبقي وقيد REVERSAL في الخزينة
- [ ] 21. إعادة طبع وصل — reprint_count يزيد والنسخة معلَّمة
- [ ] 22. تسجيل حضور جماعي لحصة — التأخر التلقائي بعد 10 دقائق، منع تكرار (athlete,session)، استهلاك حصة لاشتراك الحصص
- [ ] 23. تسجيل غياب متتابع (3) — توليد تنبيه CONSECUTIVE_ABSENCE
- [ ] 24. مصروف + رصيد افتتاحي + تسوية + إقفال يومي (فرق + سبب)
- [ ] 25. التقارير: ديون/إيرادات/حضور + تصدير CSV/Excel (تحقق تعقيم الخلايا التي تبدأ بـ =) + سجل Audit كامل + نسخة احتياطية

## 4) اختبارات التزامن الإلزامية (Integration على MySQL/MariaDB حقيقية — لم تُشغَّل بعد)

- دفعتان متزامنتان على نفس الاشتراك ⇒ لا تجاوز للمتبقي (قفل الصف).
- إضافة عضوين متزامنين لمقعد أخير ⇒ واحد ينجح والآخر CAPACITY_EXCEEDED.
- حصتان متداخلتان لنفس المدرب من اتصالين ⇒ تُرفض الثانية بكشف التعارض في طبقة التطبيق (`findOverlapping` + `findSessionConflicts` داخل `$transaction`)؛ لا يوجد قيد EXCLUDE في MySQL ولا قفل DB احتياطي على صفوف المدرب/القاعة — لذا هذا الاختبار بالذات **غير مُتحقَّق منه**.
- وصلان متزامنان ⇒ تسلسل بلا فجوات ولا تكرار (قفل `app_locks` عبر `lockNamed()` + unique).
- تحديثان متزامنان لنفس الكيان ⇒ الثاني VERSION_CONFLICT (409).

## 5) الأوامر الدقيقة للتحقق (شغّلها في بيئة حقيقية)

```bash
# 0) المتطلبات: Node ≥ 20، MariaDB ≥ 10.11 (أو MySQL ≥ 8)
cp .env.example .env            # املأ DATABASE_URL وAPP_SECRET وSESSION_SECRET
npm install

# 1) النوعية والبناء
npm run typecheck               # tsc --noEmit (strict) — ✅ 0 أخطاء على MariaDB (2026-10-11)
npm run lint -- --max-warnings=0   # ✅ "No ESLint warnings or errors" (2026-10-11)
npm run build                   # prisma generate && next build — ✅ exit 0 بـ NODE_ENV=production (2026-10-11)

# 2) الوحدة + التغطية
npm run test                    # vitest run (الاختبارات النقية تعمل بلا قاعدة بيانات) — ✅ 180 اختبارًا / 18 ملفًا على MariaDB (2026-10-11)
npm run test:coverage           # سجّل الأرقام هنا — حاليًا NOT VERIFIED

# 3) التكامل على قاعدة اختبار حقيقية
mysql -u root -e "CREATE DATABASE IF NOT EXISTS sports_management_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
export TEST_DATABASE_URL="mysql://root@localhost:3306/sports_management_test"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma db push     # لا هجرة مولّدة في المستودع
mysql -u root sports_management_test < prisma/raw-constraints.sql
DATABASE_URL="$TEST_DATABASE_URL" npm run test   # إن وُسمت اختبارات التكامل بمتغير بيئة خاص بها — لم يُتحقق منها على MariaDB

# 4) E2E (Playwright) — ✅ 66/66 على MariaDB المحلية (2026-10-11)
npx playwright install --with-deps chromium
npm run test:e2e

# 5) التحقق الشامل
npm run verify                  # lint + typecheck + test + build
```

## 5.1) تشغيل E2E (Playwright) — متطلبات اليوم

- **لا أسرار مطلوبة في `.env`:** `playwright.config.ts` يستورد `./scripts/load-env` ليرث العمال
  بقية المتغيرات (`DATABASE_URL`، `APP_SECRET…`)، لكن حساب الدخول له افتراضي في
  `tests/e2e/helpers.ts`: `admin@demo.test` بكلمة `seed:demo` الموثقة في المستودع. أي
  `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` مضبوطة تتقدم على الافتراضي. الدافع: حساب
  `npm run seed` يولد بـ `mustChangePassword=true`، فكان أول تشغيل E2E يغيّر كلمة مرور مدير
  الإنسان فيُستهلك الحساب الموثّق في README.
- **خادم يعمل على `APP_URL`:** الافتراضي `http://localhost:3000`. إن لم يكن خادم منصتًا يرفع
  الإعداد خادمًا بنفسه عبر `npm run dev`؛ مع `reuseExistingServer` يُعاد استخدام الخادم القائم —
  والموصى به تشغيل بناء إنتاجي (`NODE_ENV=production npm run build && npm run start`) لتطابق
  الترويسات والتمهير المسبق وتقليل مهلات التصريف.
- **إن استُخدم حساب seed المرجعي:** فالحساب يولد مع تغيير إلزامي لكلمة المرور، لذا يغيّره أول
  تشغيل إلى `E2E_PASSWORD` (افتراضيًا `E2e#Passw0rd!`)؛ مساعد `adminSession` قابل للتكرار ولا يفشل
  إن غيّره مشروع/عامل آخر قبله، ويُرجع الكلمة الصالحة فعليًا لتستعملها اختبارات المتصفح.
- **مشروع واحد سريعًا:** `npx playwright test --project=desktop` (والمشاريع: desktop، tablet،
  mobile-320/375/390/430).

## 5.5) نتائج التشغيل الفعلي — 2026-10-11 (Windows، MariaDB 10.11 المحلية)

**هذه هي النتائج الحالية** — كل الأوامر التالية نُفِّذت فعلًا ضد قاعدة `sports_management` المحلية:

| الأمر | النتيجة الفعلية |
|-------|-----------------|
| `npm run typecheck` | ✅ 0 أخطاء |
| `npm run lint` | ✅ `next lint` + `eslint . --max-warnings=0` على كل المستودع — 0 أخطاء/0 تحذيرات (البوابة وُسِّعت في صيانة 2026-10-11؛ انظر FINAL_AUDIT #8) |
| `npx vitest run` | ✅ **18 ملفًا / 180 اختبارًا** (0 فشل)، منها `src/modules/imports/imports.test.ts` (9) |
| `NODE_ENV=production npx next build` | ✅ exit 0 |
| `npx playwright test` | ✅ **66/66** عبر 6 مشاريع مقاسات (desktop/tablet/mobile-320/375/390/430) — مرّتين: على `next dev` ثم على بناء إنتاجي يعمل بـ `npm run start` (44.1ث، بلا أسرار في `.env` — ADR-16) |
| `npm run backup` | ✅ ملف `.sql` بحجم 242059 بايت + SHA-256 + صف `backup_records` + احتفاظ GFS |
| `npm run restore -- --id=... --reason=... --confirm=RESTORE` | ✅ نسخة أمان تلقائية ← استيراد `mysql` ← `restoredAt` ← `system.maintenanceMode=false` ← عدد الصفوف مطابق |
| `npm run worker -- --once` | ✅ كل المهام SUCCESS؛ تشغيل ثانٍ → SKIPPED على نفس `lock_key` |
| متصفح على `localhost:3000` | ✅ الدخول، اللوحة ببيانات حقيقية، بطاقة طباعة الرياضي، ومعالج الاستيراد |

**أثر اختبارات E2E على القاعدة:** `tests/e2e/40-import-ui.spec.ts` يستعمل معالج الاستيراد الحقيقي
(رفع `tests/e2e/fixtures/import-invalid.csv` ← ربط الأعمدة المقترح تلقائيًا ← معاينة: صفّان /
0 صالحة / 2 مرفوضة / 0 مكررة مع سببي الرفض (نشاط غير معروف + صيغة تاريخ خاطئة) ← اعتماد ←
بطاقة النتيجة (0 نجاح / 2 فشل) ← تنزيل ملف الأخطاء والتحقق من محتواه). يترك وراءه صفوف عمليات
في جدول `import_jobs` فقط — **لا يُنشأ أي رياضي** (تتحقق المجموعة ذلك صراحةً).

**أعطال حقيقية كشفها هذا التشغيل وأُصلحت (التفاصيل في `docs/PROGRESS.md`):**
رفض كل قراءة من التخزين على Windows (`src/shared/storage/index.ts` — صار `resolveStoragePath()`)،
إدراج `registrationNo` فارغًا والتصادم على القيد الفريد (`src/modules/imports/entities.ts`)،
عدم الإبلاغ عن النشاط المجهول في صفوف مرفوضة لسبب آخر (`src/modules/imports/service.ts`)،
فشل `restore()` عند `markRestored` (`src/modules/backups/service.ts` + `repository.ts`)،
عدم تحميل `.env` في `playwright.config.ts`، وتحقق `30-security.spec.ts` من ترويسة CSP لم يعد
المشروع يرسلها.

## 5.6) نتائج حقبة Neon/PostgreSQL — 2026-10-10 (Windows، Node v24.18.0) — تاريخي

بيانات الاختبار (تاريخية): قاعدة PostgreSQL 16 على Neon (مشروع `sports-management-test`)، والخادم
`next start` على `localhost:3000`. هذه أرقام حقيقية من أوامر نُفِّذت، لا أهداف — لكنها **قبل**
الانتقال إلى MySQL/MariaDB (ADR-13). **عُوِّضت بالأرقام الحالية في §5.5** (MariaDB 2026-10-11)؛
بقي منها ما لم يُعَد على MariaDB: قياسات الأداء وأرقام التغطية.

المُتحقَّق منه على MariaDB المحلية اليوم (§5.5) يشمل كل ما كان هنا: `npx prisma db push`
و `mysql -u root sports_management < prisma/raw-constraints.sql`، و`npm run seed` + `npm run seed:demo`،
ودخول عبر المتصفح على `localhost:3000` مع لوحة ببيانات حقيقية، و`npm run typecheck` نظيف،
و`npm run lint -- --max-warnings=0`، و`npx vitest run` (180 اختبارًا)، والبناء الإنتاجي، وE2E.

| الأمر | النتيجة الفعلية (تاريخي — Neon) |
|-------|-----------------|
| `npm install` | ✅ نجح |
| `npm run typecheck` (`tsc --noEmit` strict) | ✅ بلا أخطاء |
| `npx next lint --dir src --dir tests --max-warnings 0` | ✅ لا أخطاء ولا تحذيرات |
| `npx vitest run` | ✅ **17 ملفًا / 171 اختبارًا** (0 فشل) — مدة ≈ 3.4ث (الحالي على MariaDB: 18 ملفًا / 180 اختبارًا) |
| `npm run build` (`prisma generate && next build`) | ✅ نجح؛ كل المسارات (API + الصفحات) تولّد (أُعيد على MariaDB: exit 0) |
| `npm run seed` + `seed:demo` | ✅ نجحا على Neon (تاريخي) — وأُعيدا بنجاح محليًا على MariaDB (بيانات تجريبية: رياضيين/مجموعات/اشتراكات/دفعات/وصولات/حصص/مصاريف) |
| `npx playwright test` (كل المشاريع) | ✅ **66/66** على MariaDB عبر 6 مشاريع مقاسات (2026-10-11، انظر §5.5) — أرقام Neon/PostgreSQL السابقة كانت تاريخية |
| فحص API يدوي (curl) | ✅ دخول 200 + كوكي `sms_session`؛ 26 مسار قراءة أعادوا 200؛ أنواع التقارير الـ13 كلها 200؛ تصدير CSV أعاد ترويسة BOM عربية وبيانات حقيقية؛ بلا جلسة ⇒ 401؛ نوع تقرير خاطئ ⇒ 400 مع `fieldErrors` |

**ما اكتُشف أثناء التشغيل الفعلي وأُصلح:**
1. أخطاء الاتصال العابرة بقاعدة البيانات (إعادة تعيين TCP بعد تجمّد حوسبة Neon) كانت تُرجع
   **500** بلا أي سجل على الخادم. الآن: **503 + `Retry-After: 2`** مع كود
   `SERVICE_UNAVAILABLE`، وسجل `[api-error]` لأي خطأ Prisma غير مصَنَّف، وإعادة محاولة
   واحدة لطلبات GET في عميل الواجهة. (`src/shared/api/db-errors.ts`،
   `src/shared/api/route.ts`، `src/shared/api/client.ts` + اختبار وحدة
   `db-errors.test.ts`)
2. تحذير next-intl: `getRequestConfig` لم يُرجع `locale` — أُصلح باستخدام `requestLocale`
   وإرجاع `locale` صراحةً (`src/shared/i18n/request.ts`).

**لم يُتحقق بعد (يتطلب بيئة/وقتًا) — لا يزال صحيحًا بعد تشغيل 2026-10-11:**
- §4 اختبارات التكامل والتزامن (دفعتان متزامنتان، مقعد أخير، تعارض الحصص تحت تزامن متوازٍ
  حقيقي) — لم تُكتب/لم تُشغَّل؛ MySQL لا يطبّق EXCLUDE gist فالبديل برمجي فقط.
- `npm run test:coverage` بأرقام تغطية موثقة.
- دورة الـ25 خطوة الكاملة (§3) كاختبار آلي واحد — الملفات الحالية تغطي الدخان والماليات
  والصلاحيات والأمان والاستيراد.
- `seed:load` (أحمال) وقياسات الأداء (P95) و`EXPLAIN FORMAT=JSON` على MariaDB.
- تدفق 2FA الحيّ عبر الواجهة (وحدوي فقط) وقاعدة متصفح offline-first + المزامنة السحابية
  (غير منفّذة أصلًا).
- بناء صورة Docker وdocker-compose. *(سكربتات النسخ الاحتياطي/الاستعادة وworker شُغِّلت
  فعلًا على MariaDB في 2026-10-11 — §5.5.)*
- هجرات Prisma المولّدة (المخطط طُبّق عبر `db push` + `prisma/raw-constraints.sql` على MariaDB).

## 6) قواعد

- **لا تُضعف اختبارًا لينجح** (CONVENTIONS).
- اختبارات التكامل على MySQL/MariaDB حقيقية فقط — SQLite لا يطبق `FOR UPDATE` ولا
  قيود CHECK بنفس السلوك، كما أن كشف تعارض الحصص والتفرّد مع الحذف الناعم صارا في
  طبقة التطبيق فنتائجه على SQLite مضللة لهذه الحالات.
- أي نتيجة تُسجَّل في هذه الوثيقة يجب أن تُلصق مخرجاتها الخام + التاريخ + البيئة.
