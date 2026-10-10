'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useSession } from '@/shared/components/session-context';
import {
  dateFormatter,
  dateTimeFormatter,
  moneyFormatter,
  numberFormatter,
  percentFormatter,
  timeFormatter,
} from '@/shared/lib/format';

export interface Formatters {
  money: (minor: string | number | bigint) => string;
  /** قيمة عشرية جاهزة (من تجميعات الخادم مثل Dashboard) → نص عملة. */
  moneyDecimal: (value: number | null | undefined) => string;
  date: (value: string | Date | null | undefined) => string;
  dateTime: (value: string | Date | null | undefined) => string;
  time: (value: string | Date | null | undefined) => string;
  number: (value: number | null | undefined) => string;
  percent: (value: number | null | undefined) => string;
  locale: string;
}

/** منسقات مرتبطة بإعدادات المؤسسة واللغة الحالية — تُستخدم في كل الصفحات. */
export function useFormatters(): Formatters {
  const { settings } = useSession();
  const locale = useLocale();
  return useMemo(() => {
    const numLocale = locale === 'ar' && settings.numberSystem ? `${locale}-u-nu-${settings.numberSystem}` : locale;
    const currencyFmt = new Intl.NumberFormat(numLocale, {
      style: 'currency',
      currency: settings.currencyCode,
      minimumFractionDigits: settings.currencyDecimals,
      maximumFractionDigits: settings.currencyDecimals,
    });
    return {
      money: moneyFormatter({ locale, settings }),
      moneyDecimal: (value: number | null | undefined) =>
        value === null || value === undefined ? '—' : currencyFmt.format(value),
      date: dateFormatter({ locale, settings }),
      dateTime: dateTimeFormatter({ locale, settings }),
      time: timeFormatter({ locale, settings }),
      number: numberFormatter(locale, settings),
      percent: percentFormatter(locale),
      locale,
    };
  }, [locale, settings]);
}
