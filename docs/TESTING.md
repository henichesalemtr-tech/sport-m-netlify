# استراتيجية الاختبار (TESTING)

> ## ⚠️ لم يُتحقق منه / NOT VERIFIED in this environment
> **لم يُشغَّل أي اختبار (unit/integration/E2E) ولم يُبنَ المشروع في بيئة كتابة هذه
> الوثيقة، لأن node/npm/docker/PostgreSQL غير متوفرة هنا.** لا توجد نتائج أو أرقام
> تغطية موثقة أدناه عمدًا — أي رقم سيُذكر كان سيكون مفبركًا.
> للتشغيل الفعلي استخدم الأوامر في القسم 5، ثم سجّل النتائج هنا وفي `docs/PROGRESS.md`.

## 1) الاستراتيجية (3 مستويات)

| المستوى | الأداة | النطاق |
|---------|--------|--------|
| Unit | Vitest (`*.test.ts` جنبًا إلى جنب مع الوحدات) | منطق نقي: المال (`shared/money`)، التواريخ/العمر/السنة المالية (`shared/dates`)، حالات الاشتراك (`subscriptions/logic.ts`)، الاحتفاظ بالنسخ (`backups/retention.ts`)، تعقيم CSV (`shared/export`)، استنتاج الفئات العمرية، قواعد الخزينة (`cash/logic.ts`)، إشعارات dedupe، أرقام التسجيل |
| Integration | Vitest على **PostgreSQL حقيقي** | الخدمات كاملة: ذرّية الدفع (دفعة+خزينة+وصل+Audit)، Idempotency، منع تجاوز السعة تحت التزامن، EXCLUDE لتعارض الحصص، تسلسل الوصلات بلا فجوات، انتقالات الاشتراك، قفل version/409 |
| E2E | Playwright (`playwright.config.ts` موجود) | الدورة الكاملة أدناه (25 خطوة) عبر الواجهة/API مع بيانات `seed:demo` |

ملاحظة: `vitest.config.ts` و`playwright.config.ts` موجودان في المستودع، وتوجد ملفات
اختبار فعلية مثل `src/modules/subscriptions/subscriptions.test.ts`،
`src/modules/cash/cash.test.ts`، `src/modules/dashboard/dashboard.test.ts`،
`src/modules/notifications/notifications.test.ts`، `src/shared/export/export.test.ts` —
**لكنها لم تُشغَّل هنا.**

## 2) أهداف التغطية (Targets — ليست نتائج)

- المنطق المالي والتواريخ وحالات الاشتراك: **100%** من الدوال النقية (فرض إلزامي).
- الخدمات المالية (payments/subscriptions/cash/receipts): **≥ 90%** فروع.
- بقية الخدمات: **≥ 75%** عبارات.
- E2E: دورة العمل الكاملة (القسم 3) ناجحة من الطرف للطرف.
- تُقاس بـ `npm run test:coverage` — **النتيجة الحالية: غير مقاسة (NOT VERIFIED)**.

## 3) قائمة الدورة الكاملة E2E (المواصفة 11.3 — 25 خطوة)

نفّذها يدويًا أو كسيناريو Playwright بعد `npm run seed && npm run seed:demo`.
علّم كل خطوة بعد التحقق الفعلي — **كلها حاليًا غير مُتحقَّق منها**:

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
- [ ] 16. توليد حصص متكررة للمجموعة والتحقق من رفض تعارض المدرب/القاعة (EXCLUDE)
- [ ] 17. تسجيل دفعة 900.00 (Idempotency-Key) — إعادة الإرسال لا تضاعف الدفعة
- [ ] 18. التحقق من الوصل: رقم تسلسلي بلا فجوات للسنة المالية، والقيود: متبقي 900.00
- [ ] 19. محاولة دفع 1000.00 إضافية ⇒ رفض OVERPAYMENT (المتبقي 900) ما لم يُفعَّل allowOverpay
- [ ] 20. إلغاء دفعة (void) بسبب — والتحقق من إعادة اشتقاق paidAmount/المتبقي وقيد REVERSAL في الخزينة
- [ ] 21. إعادة طبع وصل — reprint_count يزيد والنسخة معلَّمة
- [ ] 22. تسجيل حضور جماعي لحصة — التأخر التلقائي بعد 10 دقائق، منع تكرار (athlete,session)، استهلاك حصة لاشتراك الحصص
- [ ] 23. تسجيل غياب متتابع (3) — توليد تنبيه CONSECUTIVE_ABSENCE
- [ ] 24. مصروف + رصيد افتتاحي + تسوية + إقفال يومي (فرق + سبب)
- [ ] 25. التقارير: ديون/إيرادات/حضور + تصدير CSV/Excel (تحقق تعقيم الخلايا التي تبدأ بـ =) + سجل Audit كامل + نسخة احتياطية

## 4) اختبارات التزامن الإلزامية (Integration على Postgres حقيقي)

- دفعتان متزامنتان على نفس الاشتراك ⇒ لا تجاوز للمتبقي (قفل الصف).
- إضافة عضوين متزامنين لمقعد أخير ⇒ واحد ينجح والآخر CAPACITY_EXCEEDED.
- حصتان متداخلتان لنفس المدرب من اتصالين ⇒ إحداهما تفشل بقيد EXCLUDE.
- وصلان متزامنان ⇒ تسلسل بلا فجوات ولا تكرار (قفل استشاري + unique).
- تحديثان متزامنان لنفس الكيان ⇒ الثاني VERSION_CONFLICT (409).

## 5) الأوامر الدقيقة للتحقق (شغّلها في بيئة حقيقية)

```bash
# 0) المتطلبات: Node ≥ 20، PostgreSQL ≥ 15
cp .env.example .env            # املأ DATABASE_URL وAPP_SECRET وSESSION_SECRET
npm install

# 1) النوعية والبناء
npm run typecheck               # tsc --noEmit (strict)
npm run lint
npm run build                   # prisma generate && next build

# 2) الوحدة + التغطية
npm run test                    # vitest run (الاختبارات النقية تعمل بلا قاعدة بيانات)
npm run test:coverage           # سجّل الأرقام هنا — حاليًا NOT VERIFIED

# 3) التكامل على قاعدة اختبار حقيقية
createdb sports_management_test
export TEST_DATABASE_URL="postgresql://sms_user:sms_password@localhost:5432/sports_management_test?schema=public"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate dev
psql "postgresql://sms_user:sms_password@localhost:5432/sports_management_test" -f prisma/raw-constraints.sql
DATABASE_URL="$TEST_DATABASE_URL" npm run test   # إن وُسمت اختبارات التكامل بمتغير بيئة خاص بها

# 4) E2E (Playwright)
npx playwright install --with-deps chromium
npm run test:e2e

# 5) التحقق الشامل
npm run verify                  # lint + typecheck + test + build
```

## 6) قواعد

- **لا تُضعف اختبارًا لينجح** (CONVENTIONS).
- اختبارات التكامل على PostgreSQL حقيقي فقط — SQLite لا يطبق EXCLUDE/الفهارس
  الجزئية فنتائجه مضللة لهذه الحالات.
- أي نتيجة تُسجَّل في هذه الوثيقة يجب أن تُلصق مخرجاتها الخام + التاريخ + البيئة.
