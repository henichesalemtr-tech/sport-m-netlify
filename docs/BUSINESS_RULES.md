# قواعد العمل (BUSINESS_RULES)

> **NOT VERIFIED / لم يُتحقق منه:** القواعد أدناه موثقة من قراءة الكود الفعلي
> (مع إحالات الملفات) لكنها لم تُختبر تشغيليًا في بيئة التوثيق (لا node/postgres).
>
> كل القيم "القابلة للضبط" تُدار من جدول `settings` (لا قيم صلبة في الكود) —
> انظر `docs/ASSUMPTIONS.md`.

## 1) المال (shared/money + المدفوعات)

1. **BigInt بأصغر وحدة دائمًا** (DZD بخانتين ⇒ 2000.00 = `200000n`). ممنوع float
   في أي حساب مالي — التحويل عبر `toMinorUnits` (تقريب نصف-لأعلى عند تجاوز
   الخانات المسموحة) والعرض عبر `fromMinorUnits/formatMoney` فقط.
2. **الخصم يُقرَّب مرة واحدة فقط:** `applyDiscount` — نسبة الخصم مخزنة ×100
   (1250 = 12.5%)، و`discountAmount = price × value / 10000` **بتقريب لأسفل**
   (الأكثر أمانًا ماليًا) — ولا يُعاد التقريب في خطوات لاحقة. الخصم لا يتجاوز السعر.
3. **الصافي:** `net = price − discount` (يُحسب مرة واحدة عند إنشاء/تعديل الاشتراك
   ويُخزن في `net_amount`).
4. **المتبقي (7.11):** `remaining = netAmount − مجموع الدفعات غير الملغاة (COMPLETED)`.
   **مصدر الحقيقة هو جدول payments** — `subscription.paid_amount` قيمة مشتقة
   تُعاد اشتقاقها داخل نفس معاملة أي دفعة/إلغاء/استرداد (وتسويها مهمة reconcile).
5. **الدفع الزائد:** مرفوض افتراضيًا (`payment.allowOverpay=false`) ⇒
   `409 OVERPAYMENT_NOT_ALLOWED`. عند تفعيله يُسمح ويُوثق الفرق.
6. **الدفعة غير قابلة للتعديل:** لا يوجد تحديث للمبلغ — التصحيح إما
   **إلغاء (void)** بسبب إلزامي (يعيد اشتقاق paidAmount + قيد خزينة REVERSAL)
   أو **استرداد (refund)** بسبب إلزامي؛ لا يمكن استرداد دفعة ملغاة
   ("الإلغاء يغطي التصحيح" — payments/service).
7. **ذرّية كاملة:** الدفعة = إنشاء Payment + إعادة اشتقاق paidAmount + قيد خزينة
   INCOME + وصل تسلسلي + Audit — في `prisma.$transaction` واحد؛ أي فشل ⇒ تراجع كامل.
8. **رقم الحركة:** `PAY-<السنة المالية>-<تسلسل 6 خانات>` (payments/logic.ts) —
   التسلسل بقفل استشاري لكل سنة مالية ⇒ فريد وبلا فجوات تحت التزامن.
9. **Idempotency:** `Idempotency-Key` + قيد فريد؛ عند P2002 تُعاد نتيجة الدفعة
   السابقة نفسها (لا تكرار).
10. **قيد القاعدة:** `payments.amount > 0` و`expenses.amount > 0` (CHECK — raw SQL).
11. **لا دفع على اشتراك ملغى** (businessRule في payments/service).

## 2) الاشتراكات (subscriptions/logic.ts + service.ts — 7.9/7.10)

1. **الحالات:** ACTIVE, EXPIRED, SUSPENDED, RENEWING, CANCELLED.
2. **الانتقالات المسموحة فقط** (`ALLOWED_TRANSITIONS` + `canTransition`):
   - ACTIVE → EXPIRED (تلقائي يوميًا عبر مهمة expire-subscriptions) | SUSPENDED | RENEWING | CANCELLED
   - EXPIRED → RENEWING | CANCELLED
   - SUSPENDED → ACTIVE (استئناف) | CANCELLED
   - RENEWING → CANCELLED فقط
   - CANCELLED → (لا شيء — حالة نهائية)
   أي انتقال آخر ⇒ `BUSINESS_RULE_VIOLATION` (422).
3. **المدة:** `endDate = startDate + durationDays − 1` (يوم البداية يُحتسب —
   `deriveEndDate`). أنواع SESSIONS/CUSTOM بلا مدة ⇒ endDate/sessionsTotal مطلوبة.
4. **منع التداخل:** لا يجوز اشتراكان نشطان لنفس الرياضي في نفس النشاط ⇒
   `409 CONFLICT` ("يوجد اشتراك نشط آخر...").
5. **الخصم:** يتطلب سببًا إلزاميًا (≥5 أحرف) + صلاحية `subscriptions.apply_discount`؛
   FIXED (مبلغ نصي بخانتين) أو PERCENT (نسبة ×100).
6. **تعديل السعر:** فقط إذا كان النوع `allowPriceEdit=true`.
7. **التجديد (renew):** القديم ⇒ RENEWING (**لا يُمسح أبدًا**) ويُنشأ جديد
   مرتبط بـ `renewedFromId`؛ البداية = يوم بعد نهاية القديم، أو **اليوم** إذا كان
   منتهيًا وإعداد `subscription.renewStartTodayWhenExpired` مفعّل (`computeRenewalStart`).
   نقل الدفعات/الأرصدة لا يتم تلقائيًا — الاشتراك الجديد يبدأ من صفر.
8. **الإيقاف المؤقت (suspend):** بسبب إلزامي + فترة (suspendStart/End)؛
   نهاية الإيقاف لا تكون في الماضي؛ الاستئناف (resume) يعيد ACTIVE.
9. **الإلغاء (cancel):** من أي حالة، بسبب إلزامي؛ لا دفعات جديدة بعده.
10. **حصص الاشتراك (SESSIONS):** `sessions_total` و`sessions_used` — يُستهلك عند
    حضور فعلي (انظر §4) ويُعكس عند التصحيح.
11. **CHECK في القاعدة:** `end_date >= start_date` وكل القيم المالية ≥ 0.

## 3) السعة والمجموعات (groups/service.ts — 7.6)

1. **فرض السعة داخل Transaction بقفل صف المجموعة** (`SELECT ... FOR UPDATE`):
   عدّ الأعضاء النشطين (leftAt=null) ومقارنة `max_capacity`.
2. **التجاوز:** يتطلب `overrideCapacity=true` + صلاحية `groups.override_capacity`
   + `overrideReason` إلزامي ⇒ يُسجل في Audit (capacityOverride + السبب).
   بدونه ⇒ `409 CAPACITY_EXCEEDED`.
3. **خفض السعة** تحت عدد الأعضاء الحالي يتطلب نفس شروط التجاوز.
4. **عضوية نشطة واحدة:** `@@unique([group_id, athlete_id, left_at])` — الخروج
   يسجل leftAt/leaveReason ولا يحذف التاريخ.
5. النقل بين المجموعات عبر `/groups/[id]/transfer` (نفس قواعد السعة على الهدف).

## 4) الحضور (attendance — 7.8)

1. **سجل واحد لكل (رياضي، حصة):** `@@unique([athlete_id, session_id])` —
   التسجيل الجماعي يحدّث الموجود بدل إنشاء مكرر.
2. **التأخر:** يُحسب من `recordedAt` مقابل بداية الحصة (`lateMinutes`)؛
   إذا تجاوز `attendance.lateMinutes` (افتراضي 10) ⇒ الحالة LATE تلقائيًا مع
   minutesLate.
3. **استهلاك الحصص:** الحضور الفعلي (PRESENT/LATE) لاشتراك من نوع حصص يستهلك
   حصة (`consumeSessionQuota` مع `consumed_session` لمنع الاستهلاك المزدوج)؛
   التصحيح إلى غياب **يعكس** الاستهلاك (`reverseSessionQuota`).
4. **نافذة التعديل:** تعديل سجل بعد نهايته مسموح داخل نافذة
   (نهاية الحصة + `attendance.edit_window_minutes`) — خارجها يتطلب
   `attendance.edit_past` + Audit.
5. **الغياب المتتابع:** عند بلوغ `attendance.consecutiveAbsenceAlert` (افتراضي 3)
   غيابات متتالية ⇒ إشعار CONSECUTIVE_ABSENCE بـ `dedupeKey` يومي (لا تكرار).
6. **Idempotency:** حقل `idempotency_key` فريد لسجل الحضور الفردي.
7. **المسح (scan):** رمز الرياضي = HMAC-SHA256 (بـ APP_SECRET) over معرف+إصدار
   (`scan_code_hash` فريد، `scan_code_version` للإبطال وإعادة الإنشاء)؛
   تكرار المسح خلال `scan.dedupSeconds` (افتراضي 10) مرفوض.

## 5) الحصص والجدولة (7.7)

1. **لا تداخل** لنفس المدرب أو القاعة أو المجموعة في نطاق `[start_time, end_time)`
   — مضمون **في قاعدة البيانات** بثلاثة قيود `EXCLUDE USING gist` (تستثني
   CANCELLED والمحذوف) ⇒ `SESSION_CONFLICT` حتى تحت التزامن.
2. التوليد التكراري من جدول المجموعة (series_id + is_exception للاستثناءات)،
   بحد أقصى `sessions.generate_ahead_days` من اليوم.
3. الإلغاء/إعادة الجدولة بسبب إلزامي؛ الملغاة لا تحتسب في التعارض.

## 6) الوصول (receipts — gapless)

1. **رقم الوصل:** `REC-<السنة المالية>-<تسلسل 6 خانات>`؛ `@@unique([fiscal_year, sequence])`.
2. **بلا فجوات:** التسلسل يُشتق داخل معاملة الدفعة بقفل استشاري بمفتاح السنة ثم
   `max(sequence)+1` (`nextReceiptSequence`)؛ دوال `findSequenceGaps/isGapless`
   للتحقق. الإلغاء (void) **لا يحذف الوصل** ولا يفتح فجوة — يبقى بصفته ملغى.
3. **إعادة الطبع:** تزيد `reprint_count` + `last_reprint_at` وتُعلم النسخة
   (نسخة/REPRINT) — Audit لكل إعادة طبع (payments.reprint_receipt).
4. القالب `receipt.template` (A4|80mm).

## 7) الخزينة والمصاريف (cash — 7.x)

1. **دفتر Append-Only:** `cash_transactions` لا تُعدَّل ولا تُحذف برمجيًا؛
   التصحيح بقيد معاكس (REVERSAL/ADJUSTMENT) بسبب إلزامي.
2. **كل حركة تحمل `balance_after`** — الرصيد يُشتق من الدفتر (`computeBalance`)
   وتسويه مهمة reconcile.
3. الأنواع: OPENING_BALANCE, INCOME (الدفعات تلقائيًا), EXPENSE (المصاريف),
   ADJUSTMENT (تسويات يدوية بسبب), REVERSAL (إلغاء دفعة/مصروف).
4. **الإقفال اليومي:** `cash_closings` — تاريخ فريد؛ `difference = counted − expected`
   (`closingDifference`)؛ الفرق ≠ 0 يتطلب سببًا. الإقفال لا يمنع حركات لاحقة
   تاريخها سابق (يُنصح بمراجعته في التقارير).
5. المصروف: إلغاء (void) بسبب بدل الحذف + قيد REVERSAL مقابل.

## 8) التواريخ والمناطق الزمنية (4.4)

1. الطوابع الزمنية UTC (timestamptz)، التواريخ التجارية DATE.
2. **"اليوم" يُحسب بمنطقة المؤسسة** (`timezone` = Africa/Algiers افتراضيًا) —
   `todayIn()` — لا بمنطقة جهاز المستخدم أو الخادم.
3. **السنة المالية:** `fiscalYear(date, fiscal.startMonth=9, tz)` — الشهر ≥ 9 ⇒
   السنة التقويمية، وإلا السابقة. أرقام الحركات/الوصولات تُنسب لها.
4. الفترات (يوم/أسبوع/شهر/سنة للتقارير) تُحسب بـ `periodRange` بنفس المنطقة؛
   الأسبوع يبدأ الأحد.
5. العمر (`calcAge`) من تاريخ الميلاد حتى تاريخ مرجعي — يُستخدم لاقتراح الفئة
   العمرية (مرجع الموسم: `season_start_month` للفئة، افتراضي 9).

## 9) أرقام التسجيل والتكرار (athletes)

1. **رقم التسجيل:** يُولَّد تلقائيًا من `athletes.registrationFormat`
   (افتراضي `ATH-{YYYY}-{SEQ:5}` — تدعم {YYYY}/{MM}/{SEQ:n}) مع تسلسل لكل سنة؛
   فريد عبر فهرس جزئي (`WHERE deleted_at IS NULL`) ⇒ يمكن إعادة استخدام رقم
   رياضي محذوف ناعمًا فقط إذا لم يتعارض مع نشط.
2. **كشف التكرار:** مطابقة الاسم+تاريخ الميلاد (وغيرها) عبر
   `/athletes/duplicates`؛ الإنشاء رغم التطابق يتطلب `overrideDuplicate=true`؛
   تكرار هاتف الولي يعطي تحذيرًا مماثلًا.
3. الحذف ناعم (`deletedAt`) مع استعادة (`athletes.restore`)؛ المحذوف لا يظهر
   في القوائم ولا في فهارس الفريدة الجزئية.

## 10) التعديل المتزامن (عام)

كل كيان رئيسي يحمل `version`؛ طلبات التحديث/الحذف تمرر النسخة المقروءة؛
عدم التطابق ⇒ `409 VERSION_CONFLICT` — يمنع "الكتابة الأخيرة تمحو السابقة".

## 11) حماية آخر Super Admin

حذف أو تنزيل دور آخر SUPER_ADMIN نشط ⇒ `409 LAST_SUPER_ADMIN` (users/service).
