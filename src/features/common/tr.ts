'use client';

/**
 * ترجمة آمنة مع بديل: إن كان المفتاح موجودًا في الرسالة تُستخدم، وإلا البديل.
 * يُستخدم لتفادي انهيار الواجهة عند غياب مفتاح i18n، مع الحفاظ على العربية أولًا.
 */
import type { useTranslations } from 'next-intl';

type Translator = ReturnType<typeof useTranslations>;

export function tr(t: Translator, key: string, fallback: string, values?: Record<string, string | number>): string {
  const has = (t as unknown as { has?: (k: string) => boolean }).has;
  if (typeof has === 'function' && has.call(t, key)) {
    return values ? t(key, values) : t(key);
  }
  return values ? t(key, { ...values, defaultMessage: fallback }) : fallback;
}
