/**
 * تعريف اللغات ووسوم Intl المطابقة.
 *
 * النظام عربي-جزائري: الأرقام لاتينية (0-9) لا الهندية (٠-٩)، والمنطقة الزمنية
 * Africa/Algiers. تُستخدم الوسوم الكاملة (ar-DZ) في Intl كي تكون صيغ التاريخ
 * والأسماء جزائرية (يوم/شهر/سنة) بدل الافتراضات العامة.
 */
export const locales = ['ar', 'fr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';

/** وسوم Intl المستخدمة للعرض (Intl.* / next-intl). */
export const intlLocales: Record<Locale, string> = {
  ar: 'ar-DZ',
  fr: 'fr-DZ',
  en: 'en-GB',
};

export function toIntlLocale(locale: string): string {
  return intlLocales[locale as Locale] ?? locale;
}

/** هل اللغة عربية (تشمل الوسوم المشتقة مثل ar-DZ)؟ */
export function isArabic(locale: string): boolean {
  return locale === 'ar' || locale.startsWith('ar-');
}
