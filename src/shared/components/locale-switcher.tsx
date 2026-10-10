'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui-kit/utils';

const LOCALES = [
  { code: 'ar', label: 'ع' },
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
] as const;

/** مبدّل اللغة: يعيد التوجيه إلى نفس المسار باللغة المختارة. */
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => {
            if (l.code !== locale) router.replace(pathname, { locale: l.code });
          }}
          aria-pressed={l.code === locale}
          className={cn(
            'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            l.code === locale
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
