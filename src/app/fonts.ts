/**
 * خط Cairo (متطلب CONVENTIONS.md — RTL، خط محلي).
 *
 * ⚠️ ملفات الخط غير مرفقة في المستودع. لتشغيل الخط المحلي:
 *   1) نزّل عائلة Cairo بصيغة woff2 من Google Fonts (الأوزان 400/500/600/700).
 *   2) ضع الملفات في `public/fonts/`:
 *        Cairo-Regular.woff2, Cairo-Medium.woff2, Cairo-SemiBold.woff2, Cairo-Bold.woff2
 *   3) قواعد @font-face في `src/app/globals.css` ستلتقطها تلقائيًا (font-display: swap)،
 *      ومع غياب الملفات يتم التراجع بأمان إلى خطوط النظام عبر سلسلة CSS:
 *        --font-cairo: 'Cairo', 'Segoe UI', system-ui, sans-serif
 *
 * بديل أقوى عند توفر الملفات: استبدل هذا الملف باستخدام next/font/local:
 *   import localFont from 'next/font/local';
 *   export const cairo = localFont({ src: [...], variable: '--font-cairo' });
 * ثم أضف `cairo.variable` إلى صنف <html> في layout.tsx.
 */
export interface FontConfig {
  /** متغير CSS الذي تستهلكه tailwind.config.ts (fontFamily.sans). */
  variable: string;
  /** صنف يُضاف إلى <html> — فارغ عند استخدام @font-face عبر globals.css. */
  className: string;
}

export const cairo: FontConfig = {
  variable: '--font-cairo',
  className: '',
};
