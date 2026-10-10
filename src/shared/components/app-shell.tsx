'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, Moon, Sun } from 'lucide-react';
import { usePathname } from '@/shared/i18n/navigation';
import { useSession } from '@/shared/components/session-context';
import { LocaleSwitcher } from '@/shared/components/locale-switcher';
import { NotificationsBell } from '@/shared/components/notifications-bell';
import { UserMenu } from '@/shared/components/user-menu';
import { Sidebar } from '@/shared/ui-kit/sidebar';
import { Drawer } from '@/shared/ui-kit/drawer';

/** هيكل التطبيق: قائمة جانبية ثابتة (شاشات كبيرة) + درج (موبايل) + شريط علوي. */
export function AppShell({ children }: { children: ReactNode }) {
  const tc = useTranslations('common');
  const pathname = usePathname();
  const { can, settings } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {tc('skipToContent')}
      </a>

      {/* القائمة الجانبية — شاشات كبيرة */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[var(--sidebar-width)] border-e border-border bg-card lg:block">
        <Sidebar pathname={pathname} can={can} orgName={settings.orgName} />
      </aside>

      {/* الدرج — موبايل */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={tc('appName')}>
        <Sidebar
          pathname={pathname}
          can={can}
          orgName={settings.orgName}
          onNavigate={() => setDrawerOpen(false)}
        />
      </Drawer>

      {/* الشريط العلوي */}
      <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur lg:ps-[calc(var(--sidebar-width)+0.75rem)] print-hide">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex size-touch items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          aria-label={tc('openNavigation')}
          aria-expanded={drawerOpen}
        >
          <Menu className="size-5" aria-hidden />
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex size-touch items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={dark ? tc('lightMode') : tc('darkMode')}
        >
          {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
        </button>
        <LocaleSwitcher />
        <NotificationsBell />
        <UserMenu />
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="px-3 py-4 focus:outline-none sm:px-5 lg:ps-[calc(var(--sidebar-width)+1.25rem)] lg:pe-5"
      >
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
