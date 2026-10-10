# النشر على Cloudflare Pages

تم ربط هذا المستودع تلقائيًا مع مشروع Cloudflare Pages.

## الرابط المباشر

- **الإنتاج**: https://sports-management-system.pages.dev
- **المعاينة**: يتم إنشاؤها تلقائيًا لكل Pull Request

## آلية العمل

1. **النشر التلقائي**: عند كل push إلى فرع `main`، يتم تشغيل عملية بناء ونشر جديدة تلقائيًا
2. **بيئة البناء**: تُنفَّذ الأوامر التالية:
   ```bash
   prisma generate && next build
   ```
3. **متغيرات البيئة**: مُهيَّأة مسبقًا في إعدادات المشروع

## متغيرات البيئة المطلوبة

يجب إضافة المتغيرات التالية في لوحة تحكم Cloudflare Pages (Settings → Environment Variables):

### قاعدة البيانات
```
DATABASE_URL=postgresql://...
```

### الأسرار
```
APP_SECRET=<64 hex chars>
SESSION_SECRET=<64 hex chars>
```

### الإعدادات الاختيارية
```
APP_TIMEZONE=Africa/Algiers
SMTP_ENABLED=false
TOTP_ENABLED=false
```

## مراقبة النشر

يمكنك متابعة حالة النشر من:
1. لوحة تحكم Cloudflare: https://dash.cloudflare.com/?to=/:account/pages/view/sports-management-system
2. سجل الـ commits في GitHub (كل commit يُظهر حالة النشر)

## استكشاف الأخطاء

إذا فشل البناء:
1. تحقق من logs في Cloudflare Dashboard → Deployments → View logs
2. تأكد من وجود جميع متغيرات البيئة المطلوبة
3. تحقق من أن `NODE_ENV=production` مضبوط

## ملاحظات مهمة

- التطبيق يعمل كـ Next.js SSR على Cloudflare Pages (ليس static export)
- قاعدة البيانات Neon PostgreSQL تبقى منفصلة (serverless)
- الجلسات تُخزَّن في قاعدة البيانات (ليس في cookies فقط)
- المهام المجدولة تعمل داخل العملية عبر `src/instrumentation.ts`
