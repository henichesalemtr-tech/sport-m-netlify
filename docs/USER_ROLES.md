# الأدوار والصلاحيات (USER_ROLES)

> **حالة التحقق:** المصفوفة أدناه منسوخة حرفيًا من
> `src/shared/permissions/catalog.ts` (`DEFAULT_ROLE_PERMISSIONS`). ما شُغِّل فعليًا على
> MariaDB المحلية (أكتوبر 2026): زرع الأدوار/الصلاحيات (`npm run seed`)، وتسجيل الدخول
> وعرض اللوحة من المتصفح. **غير مُتحقَّق منه:** مطابقة المصفوفة لسلوك التفويض تحت التزامن
> واختبارات الصلاحيات الكاملة على MariaDB (تشغيلات E2E السابقة كانت على Neon — تاريخية).

## 1) الأدوار النظامية (enum UserRole)

| الدور | الوصف |
|-------|-------|
| `SUPER_ADMIN` | مدير النظام — كل الصلاحيات + إدارة المستخدمين/الأدوار/الإعدادات/النسخ. محمي بقاعدة LAST_SUPER_ADMIN (لا يمكن حذف/تنزيل آخر واحد). |
| `ADMIN` | إدارة تشغيلية كاملة (افتراضيًا ALL مثل Super Admin — التمايز يتم عبر التخصيص إن رغب المالك). |
| `RECEPTION` | الاستقبال: تسجيل الرياضيين/الأولياء، الاشتراكات، الدفعات، الحضور، الحصص. |
| `COACH` | مدرب: مجموعاته ورياضيوه (نطاق `own` يُطبق في الـ Repository عبر linkedCoachId)، الحضور والتقييمات. |
| `ACCOUNTANT` | محاسب: الماليات (دفعات، مصاريف، خزينة، تقارير مالية) + قراءة عامة. |
| `VIEWER` | مطالع: قراءة فقط للكيانات غير المالية. |

## 2) كيف تُحسب الصلاحية الفعلية (guard.ts)

`الصلاحيات الفعلية = المصفوفة الافتراضية للدور ± صفوف user_role_permissions`
(granted=true تضيف، granted=false تسحب). التخصيص يتفوق على الافتراضي.
الفحص في كل route عبر `requirePermission` — وممنوع فحص الأدوار بنصوص صلبة.

## 3) المصفوفة الافتراضية الكاملة

✔ = ممنوحة افتراضيًا، — = غير ممنوحة. (SUPER_ADMIN وADMIN = **ALL** لكل الأكواد.)

| الصلاحية | SA | AD | RECEPTION | COACH | ACCOUNTANT | VIEWER |
|----------|:--:|:--:|:---------:|:-----:|:----------:|:------:|
| athletes.view | ✔ | ✔ | ✔ | ✔ (own) | ✔ | ✔ |
| athletes.create | ✔ | ✔ | ✔ | — | — | — |
| athletes.edit | ✔ | ✔ | ✔ | — | — | — |
| athletes.delete | ✔ | ✔ | — | — | — | — |
| athletes.restore | ✔ | ✔ | — | — | — | — |
| athletes.export | ✔ | ✔ | ✔ | — | — | — |
| athletes.import | ✔ | ✔ | — | — | — | — |
| athletes.view_sensitive | ✔ | ✔ | — | — | — | — |
| parents.view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| parents.create | ✔ | ✔ | ✔ | — | — | — |
| parents.edit | ✔ | ✔ | ✔ | — | — | — |
| parents.delete | ✔ | ✔ | — | — | — | — |
| sports.manage | ✔ | ✔ | — | — | — | — |
| sports.view * | ✔ | ✔ | ✔ | — | — | — |
| age_categories.manage | ✔ | ✔ | — | — | — | — |
| age_categories.view * | ✔ | ✔ | ✔ | — | — | — |
| venues.manage | ✔ | ✔ | — | — | — | — |
| venues.view * | ✔ | ✔ | ✔ | — | — | — |
| groups.view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| groups.create | ✔ | ✔ | — | — | — | — |
| groups.edit | ✔ | ✔ | — | — | — | — |
| groups.delete | ✔ | ✔ | — | — | — | — |
| groups.manage_members | ✔ | ✔ | ✔ | — | — | — |
| groups.override_capacity | ✔ | ✔ | — | — | — | — |
| coaches.view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| coaches.create / edit / delete | ✔ | ✔ | — | — | — | — |
| sessions.view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| sessions.create | ✔ | ✔ | ✔ | ✔ | — | — |
| sessions.edit | ✔ | ✔ | ✔ | ✔ | — | — |
| sessions.delete | ✔ | ✔ | — | — | — | — |
| attendance.view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| attendance.create | ✔ | ✔ | ✔ | ✔ | — | — |
| attendance.edit | ✔ | ✔ | ✔ | ✔ | — | — |
| attendance.edit_past | ✔ | ✔ | — | — | — | — |
| evaluations.view | ✔ | ✔ | ✔ | ✔ | — | — |
| evaluations.create / edit | ✔ | ✔ | — | ✔ | — | — |
| documents.view | ✔ | ✔ | ✔ | ✔ | — | — |
| documents.upload | ✔ | ✔ | ✔ | — | — | — |
| documents.delete | ✔ | ✔ | — | — | — | — |
| subscriptions.view | ✔ | ✔ | ✔ | — | ✔ | ✔ |
| subscriptions.create | ✔ | ✔ | ✔ | — | — | — |
| subscriptions.edit | ✔ | ✔ | ✔ | — | — | — |
| subscriptions.delete | ✔ | ✔ | — | — | — | — |
| subscriptions.apply_discount | ✔ | ✔ | — | — | — | — |
| subscriptions.suspend | ✔ | ✔ | — | — | — | — |
| subscriptions.cancel | ✔ | ✔ | — | — | — | — |
| payments.view | ✔ | ✔ | ✔ | — | ✔ | — |
| payments.create | ✔ | ✔ | ✔ | — | ✔ | — |
| payments.void | ✔ | ✔ | — | — | ✔ | — |
| payments.refund | ✔ | ✔ | — | — | — | — |
| payments.reprint_receipt | ✔ | ✔ | ✔ | — | ✔ | — |
| expenses.view | ✔ | ✔ | — | — | ✔ | — |
| expenses.create / edit / delete | ✔ | ✔ | — | — | ✔ | — |
| expenses.export * | ✔ | ✔ | — | — | ✔ | — |
| cash.view | ✔ | ✔ | — | — | ✔ | — |
| cash.adjust | ✔ | ✔ | — | — | ✔ | — |
| cash.close_day | ✔ | ✔ | — | — | ✔ | — |
| reports.view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| reports.view_finance | ✔ | ✔ | — | — | ✔ | — |
| reports.export | ✔ | ✔ | ✔ | — | ✔ | — |
| notifications.view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| notifications.manage | ✔ | ✔ | — | — | — | — |
| users.manage | ✔ | ✔ | — | — | — | — |
| roles.manage | ✔ | ✔ | — | — | — | — |
| settings.manage | ✔ | ✔ | — | — | — | — |
| audit.view | ✔ | ✔ | — | — | — | — |
| backup.manage | ✔ | ✔ | — | — | — | — |

\* **ملاحظة اتساق (أمانة):** الأكواد `sports.view` و`age_categories.view` و
`venues.view` و`expenses.export` مستخدمة في المسارات/المصفوفة لكن الكتالوج
(`PERMISSIONS`) يعرّف `manage` فقط لتلك الوحدات ولا يعرّف `expenses.export`.
`scripts/seed.ts` يبذر هذه الأكواد الإضافية (`EXTRA_ROUTE_CODES`) حتى تعمل
المصفوفة فعليًا بعد `resolvePermissions` (التي تبني الافتراضي من صفوف جدول
permissions). يُنصح لاحقًا بتوحيد الكتالوج بإضافة هذه الأكواد رسميًا.

## 4) تخصيص المصفوفة من Super Admin

- **قراءة:** `GET /api/v1/roles` (الأدوار) و`GET /api/v1/roles/{role}/permissions`
  (الفعّالة حاليًا).
- **تعديل:** `PUT /api/v1/roles/{role}/permissions` — يكتب صفوف
  `user_role_permissions` (granted true/false) فوق الافتراضي. كل تغيير يُدوَّن
  في audit_logs كفعل PERMISSION_CHANGE / ROLE_CHANGE.
- القواعد:
  - تخصيص الدور لا يغيّر الكتالوج — الأكواد الجديدة تظهر تلقائيًا بعد إعادة البذر.
  - سحب صلاحية من SUPER_ADMIN غير مُجدٍ عمليًا (ALL) — خصص ADMIN إن أردت دورًا
    إداريًا أدنى.
  - نطاق `own` (COACH) يُطبَّق في الـ Repository بغض النظر عن التخصيص.
