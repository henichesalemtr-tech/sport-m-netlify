/**
 * خط Cairo المحلي (متطلب RTL — خط مضمّن في المستودع، يعمل دون إنترنت).
 *
 * الملفات في `public/fonts/` (متغيّرة الأوزان 400-700، مقسّمة حسب unicode-range):
 *   Cairo-arabic.woff2, Cairo-latin-ext.woff2, Cairo-latin.woff2
 *
 * قواعد @font-face في `src/app/globals.css` تلتقطها مباشرة (font-display: swap)،
 * وسلسلة التراجع في `--font-cairo` تحمي العرض إن حُذف ملف بالخطأ.
 *
 * مصدر الملفات: Google Fonts (Cairo v31) — متاحة تحت SIL Open Font License 1.1.
 */
export interface FontConfig {
  /** متغير CSS الذي تستهلكه tailwind.config.ts (fontFamily.sans). */
  variable: string;
  /** صنف يُضاف إلى <html> — فارغ لأن التحميل يتم عبر @font-face في globals.css. */
  className: string;
}

export const cairo: FontConfig = {
  variable: '--font-cairo',
  className: '',
};
