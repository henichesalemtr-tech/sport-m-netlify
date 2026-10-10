'use client';

/**
 * سياق الجلسة: يُحقن من الخادم ([locale]/(app)/layout.tsx) بعد getSession +
 * resolvePermissions + getSettings. البوابة بالصلاحية في الواجهة استرشادية —
 * التنفيذ الحقيقي دائمًا في الخادم (5.4).
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { formatMoney } from '@/shared/money';
import { isArabic, toIntlLocale } from '@/shared/i18n/locales';
import type { SessionPayload } from '@/shared/api/types';

interface SessionContextValue {
  user: SessionPayload['user'];
  permissions: Set<string>;
  settings: SessionPayload['settings'];
  /** هل يملك المستخدم الصلاحية؟ (تحقق واجهة فقط) */
  can: (code: string) => boolean;
  canAny: (codes: string[]) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  payload,
  children,
}: {
  payload: SessionPayload;
  children: ReactNode;
}) {
  const value = useMemo<SessionContextValue>(() => {
    const permissions = new Set(payload.permissions);
    return {
      user: payload.user,
      permissions,
      settings: payload.settings,
      can: (code: string) => permissions.has(code),
      canAny: (codes: string[]) => codes.some((c) => permissions.has(c)),
    };
  }, [payload]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

/** اختصار شائع: هل يملك المستخدم صلاحية معينة. */
export function useCan(code: string): boolean {
  const { can } = useSession();
  return useMemo(() => can(code), [can, code]);
}

/** منسق المال المرتبط بإعدادات المؤسسة (العملة/الخانات/نظام الأرقام). */
export function useMoneyFormatter(): (minor: string | number | bigint) => string {
  const { settings } = useSession();
  const locale = useLocale();
  return useMemo(
    () => (minor: string | number | bigint) =>
      formatMoney(BigInt(minor), {
        decimals: settings.currencyDecimals,
        currency: settings.currencyCode,
        locale: toIntlLocale(locale),
        numberingSystem: isArabic(locale) ? settings.numberSystem : undefined,
      }),
    [settings, locale],
  );
}

/** بوابة صلاحية declarative — تخفي المحتوى عند غياب الصلاحية. */
export function Can({
  code,
  anyOf,
  children,
  fallback = null,
}: {
  code?: string;
  anyOf?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, canAny } = useSession();
  const allowed = code !== undefined ? can(code) : anyOf !== undefined ? canAny(anyOf) : true;
  return <>{allowed ? children : fallback}</>;
}

/** خطاف إعادة توجيه بعد انتهاء الجلسة (401) — يُستخدم في عميل API عالي المستوى. */
export function useUnauthorizedHandler(): (status: number) => void {
  return useCallback((status: number) => {
    if (status === 401 && typeof window !== 'undefined') {
      const lang = window.location.pathname.split('/')[1];
      const isLocale = lang === 'ar' || lang === 'fr' || lang === 'en';
      const base = isLocale && lang !== 'ar' ? `/${lang}` : '';
      window.location.assign(`${base}/login?expired=1`);
    }
  }, []);
}
