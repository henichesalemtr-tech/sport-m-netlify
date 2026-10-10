import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { defaultLocale, locales, type Locale } from '@/shared/i18n/request';

/** كوكي الجلسة (انظر src/shared/auth/session.ts) — التحقق الفعلي يتم في الخادم. */
const SESSION_COOKIE = 'sms_session';

const intlMiddleware = createMiddleware(locales, {
  defaultLocale,
  localePrefix: 'as-needed',
});

/** مسارات لا تتطلب جلسة (داخل أي لغة). */
const PUBLIC_PATHS = ['/login', '/setup'] as const;

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export default function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

  // استخراج اللغة من المسار (بادئة صريحة) أو افتراض العربية
  const segments = pathname.split('/');
  const first = segments[1] ?? '';
  const hasLocalePrefix = (locales as readonly string[]).includes(first);
  const locale: Locale = hasLocalePrefix ? (first as Locale) : defaultLocale;
  const pathWithoutLocale = hasLocalePrefix
    ? pathname.slice(locale.length + 1) || '/'
    : pathname;

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const localized = (path: string) =>
    locale === defaultLocale ? path : `/${locale}${path}`;

  // 1) حماية كل مسارات التطبيق: لا جلسة → /login (مع إعادة بعد الدخول)
  if (!hasSession && !isPublicPath(pathWithoutLocale) && pathWithoutLocale !== '/') {
    const loginUrl = new URL(localized('/login'), req.url);
    loginUrl.searchParams.set('next', `${pathWithoutLocale}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // 2) الجذر بدون جلسة → صفحة الدخول
  if (!hasSession && pathWithoutLocale === '/') {
    return NextResponse.redirect(new URL(localized('/login'), req.url));
  }

  // 3) مستخدم بجلسة يزور /login أو / أو /setup → لوحة المؤشرات
  if (hasSession && (pathWithoutLocale === '/login' || pathWithoutLocale === '/')) {
    return NextResponse.redirect(new URL(localized('/dashboard'), req.url));
  }

  // 4) تفويض next-intl (إعادة توجيه اللغة/الكوكي) لبقية المسارات
  return intlMiddleware(req);
}

export const config = {
  // استبعاد API والأصول الثابتية وملفات Next الداخلية
  matcher: ['/((?!api|_next|_vercel|fonts|icons|.*\\..*).*)'],
};
