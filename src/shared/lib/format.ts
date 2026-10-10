/**
 * منسقات عرض للواجهة (تستهلك الدوال المشتركة في shared/money و shared/dates).
 * نقية وآمنة في المتصفح والخادم — ممنوع Float للمال (يُعرض عبر BigInt).
 */
import { formatMoney, fromMinorUnits, type MinorUnits } from '@/shared/money';
import { formatDate, formatDateTime, parseDateOnly, todayIn } from '@/shared/dates';
import { isArabic, toIntlLocale } from '@/shared/i18n/locales';
import type { AppSettingsClient } from '@/shared/api/types';

export interface FormatterOptions {
  locale: string;
  settings: AppSettingsClient;
}

export function moneyFormatter({ locale, settings }: FormatterOptions) {
  const intl = toIntlLocale(locale);
  return (minor: string | number | bigint): string =>
    formatMoney(BigInt(minor), {
      decimals: settings.currencyDecimals,
      currency: settings.currencyCode,
      locale: intl,
      numberingSystem: isArabic(locale) ? settings.numberSystem : undefined,
    });
}

/** مبلغ بأصغر وحدة (نص من API) → نص عشري للحقول (نفس خانات العملة). */
export function minorToDecimal(minor: string, decimals: number): string {
  const value = fromMinorUnits(BigInt(minor) as MinorUnits, decimals);
  return value.toFixed(decimals);
}

/** تاريخ اليوم بصيغة YYYY-MM-DD وفق المنطقة الزمنية للمؤسسة (لحقول date-only). */
export function todayFor(settings: AppSettingsClient): string {
  return todayIn(settings.timezone);
}

export function dateFormatter({ locale, settings }: FormatterOptions) {
  const intl = toIntlLocale(locale);
  return (value: string | Date | null | undefined): string => {
    if (!value) return '—';
    // تواريخ DATE التجارية تصل ISO — parseDateOnly تتعامل مع YYYY-MM-DD
    const date = typeof value === 'string' ? parseDateOnly(value.slice(0, 10)) : value;
    return formatDate(date, intl, settings.timezone);
  };
}

export function dateTimeFormatter({ locale, settings }: FormatterOptions) {
  const intl = toIntlLocale(locale);
  return (value: string | Date | null | undefined): string => {
    if (!value) return '—';
    return formatDateTime(typeof value === 'string' ? new Date(value) : value, intl, settings.timezone);
  };
}

export function numberFormatter(locale: string, settings: AppSettingsClient) {
  const intl = toIntlLocale(locale);
  return (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '—';
    const l = isArabic(locale) && settings.numberSystem ? `${intl}-u-nu-${settings.numberSystem}` : intl;
    return new Intl.NumberFormat(l).format(value);
  };
}

export function percentFormatter(locale: string) {
  const intl = toIntlLocale(locale);
  return (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '—';
    return `${new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(value)}%`;
  };
}

/** وقت HH:mm من طابع ISO في منطقة المؤسسة. */
export function timeFormatter(locale: string, settings: AppSettingsClient) {
  const intl = toIntlLocale(locale);
  return (value: string | Date | null | undefined): string => {
    if (!value) return '—';
    const d = typeof value === 'string' ? new Date(value) : value;
    return new Intl.DateTimeFormat(intl, {
      timeZone: settings.timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { parseDateOnly, todayIn };
