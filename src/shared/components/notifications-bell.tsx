'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, CheckCheck } from 'lucide-react';
import { apiPost } from '@/shared/api/client';
import type { NotificationDto } from '@/shared/api/types';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useRouter } from '@/shared/i18n/navigation';
import { useSession } from '@/shared/components/session-context';
import { Loading } from '@/shared/ui-kit/loading';
import { EmptyState } from '@/shared/ui-kit/empty-state';

interface NotificationsListResponse {
  items?: NotificationDto[];
  unreadCount?: number;
}

const ENTITY_ROUTES: Record<string, string> = {
  Athlete: '/athletes',
  Subscription: '/subscriptions',
  Payment: '/payments',
  TrainingSession: '/calendar',
  AthleteDocument: '/documents',
};

/** جرس الإشعارات: استطلاع كل 60 ثانية، تعليم كمقروء، وتنقل للكيان المرتبط. */
export function NotificationsBell() {
  const t = useTranslations('notification');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const router = useRouter();
  const { can } = useSession();
  const [open, setOpen] = useState(false);

  const { data, loading, error, reload } = useApi<NotificationDto[] | NotificationsListResponse>(
    '/notifications',
    { params: { page: 1, pageSize: 10, unreadOnly: 'true' } }
  );

  useEffect(() => {
    const timer = setInterval(reload, 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  if (!can('notifications.view')) return null;

  const items: NotificationDto[] = Array.isArray(data)
    ? data
    : (data?.items ?? []);
  const unreadCount = Array.isArray(data) ? items.length : (data?.unreadCount ?? items.length);

  const openItem = async (n: NotificationDto) => {
    if (!n.isRead) {
      try {
        await apiPost(`/notifications/${n.id}/read`, {});
      } catch {
        // لا نمنع التنقل بسبب فشل التعليم
      }
    }
    setOpen(false);
    const base = n.entityType ? ENTITY_ROUTES[n.entityType] : undefined;
    if (base && n.entityId) router.push(`${base}/${n.entityId}`);
    else if (base) router.push(base);
    else router.push('/notifications');
    reload();
  };

  const markAll = async () => {
    try {
      await apiPost('/notifications/read-all', {});
      reload();
    } catch (e) {
      // تجاهل — سيظهر الخطأ في صفحة الإشعارات
      void e;
    }
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="relative inline-flex size-touch items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={unreadCount > 0 ? t('unreadCount', { count: unreadCount }) : t('titlePlural')}
        >
          <Bell className="size-5" aria-hidden />
          {unreadCount > 0 ? (
            <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground tabular-nums">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-border bg-background p-1 shadow-xl"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-bold">{t('titlePlural')}</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                {t('markAllRead')}
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <Loading label={tc('loading')} />
            ) : error ? (
              <p role="alert" className="px-3 py-2 text-xs text-destructive">{errorText(error)}</p>
            ) : items.length === 0 ? (
              <EmptyState title={t('noNotifications')} className="min-h-24" />
            ) : (
              items.map((n) => (
                <DropdownMenu.Item key={n.id} asChild>
                  <button
                    type="button"
                    onClick={() => void openItem(n)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-start text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-medium">{n.title}</span>
                    {n.body ? (
                      <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                    ) : null}
                  </button>
                </DropdownMenu.Item>
              ))
            )}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push('/notifications');
              }}
              className="w-full rounded-md px-3 py-2 text-start text-sm text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tc('showAll')}
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
