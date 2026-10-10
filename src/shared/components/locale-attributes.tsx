'use client';

import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import { isArabic, toIntlLocale } from '@/shared/i18n/locales';

/** يضبط lang/dir على <html> حسب اللغة الحالية (الجذر يُقدم ar-DZ/rtl افتراضيًا). */
export function LocaleAttributes() {
  const locale = useLocale();
  useEffect(() => {
    const html = document.documentElement;
    html.lang = toIntlLocale(locale);
    html.dir = isArabic(locale) ? 'rtl' : 'ltr';
  }, [locale]);
  return null;
}
