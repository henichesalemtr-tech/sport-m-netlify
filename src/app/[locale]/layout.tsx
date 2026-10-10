import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { locales, type Locale } from '@/shared/i18n/request';
import { LocaleAttributes } from '@/shared/components/locale-attributes';
import { Providers } from '@/shared/components/providers';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * تخطيط اللغة: لا يُصدر <html>/<body> (الجذر يفعل ذلك) —
 * يضخ الرسائل ومزودات العميل، ويضبط lang/dir عبر LocaleAttributes.
 */
export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  if (!locales.includes(locale as Locale)) notFound();

  const messages = (await import(`@/shared/i18n/messages/${locale}.json`)).default;

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <LocaleAttributes />
      <Providers>{children}</Providers>
    </NextIntlClientProvider>
  );
}
