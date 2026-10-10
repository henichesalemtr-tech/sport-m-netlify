'use client';

import { useTranslations } from 'next-intl';
import { Dumbbell } from 'lucide-react';
import { Link } from '@/shared/i18n/navigation';
import { NAV_SECTIONS } from '@/shared/components/nav-items';
import { cn } from './utils';

export interface SidebarProps {
  /** Active pathname without locale prefix, e.g. `/athletes/123`. */
  pathname: string;
  can: (code: string) => boolean;
  orgName?: string;
  className?: string;
  onNavigate?: () => void;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/' || pathname.startsWith('/dashboard');
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** القائمة الجانبية: أقسام وعناصر مبنية على الصلاحيات (استشاري — التنفيذ الحقيقي في الخادم). */
export function Sidebar({ pathname, can, orgName, className, onNavigate }: SidebarProps) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');

  return (
    <nav aria-label={tc('appName')} className={cn('flex h-full flex-col', className)}>
      <div className="flex h-[var(--topbar-height)] shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Dumbbell className="size-5" aria-hidden />
        </span>
        <span className="truncate font-bold text-foreground">{orgName || tc('appName')}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {NAV_SECTIONS.map((section, si) => {
          const items = section.items.filter(
            (item) => !item.permissions || item.permissions.length === 0 || item.permissions.some(can)
          );
          if (items.length === 0) return null;
          return (
            <div key={`${section.labelKey}-${si}`} className="mb-4">
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(section.labelKey)}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-touch items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <Icon className="size-[18px] shrink-0" aria-hidden />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
