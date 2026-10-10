import { createSharedPathnamesNavigation } from 'next-intl/navigation';
import { locales } from './request';

/**
 * تنقل مشترك المسارات (3.4): نفس أسماء المسارات بكل اللغات
 * (/ar/dashboard, /fr/dashboard, /en/dashboard — والعربية الافتراضية بلا بادئة).
 */
export const { Link, useRouter, usePathname, redirect } =
  createSharedPathnamesNavigation({ locales, localePrefix: 'as-needed' });
