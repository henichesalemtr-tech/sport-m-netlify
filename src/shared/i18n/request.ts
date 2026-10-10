import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, locales, type Locale } from './locales';

export { defaultLocale, locales, type Locale } from './locales';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale =
    requested && (locales as readonly string[]).includes(requested) ? (requested as Locale) : defaultLocale;
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
