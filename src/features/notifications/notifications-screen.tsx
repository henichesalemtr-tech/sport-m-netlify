'use client';

/**
 * شاشة الإشعارات — قائمة مُرقّمة (useList) مع مرشح نوع + غير المقروء فقط،
 * تعليم إشعار كمقروء (POST /notifications/[id]/read) وزر تعليم الكل كمقروء
 * (POST /notifications/read-all). بوابة: notifications.view (الخادم يفرض الباقي).
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BellOff, CheckCheck, MailOpen } from 'lucide-react';
import type { ApiListMeta } from '@/shared/api/client';
import { apiPost } from '@/shared/api/client';
import type { NotificationDto } from '@/shared/api/types';
import { useErrorText, useList } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { NOTIFICATION_TYPES } from '@/shared/lib/options';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Select } from '@/shared/ui-kit/select';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import { EmptyState } from '@/shared/ui-kit/empty-state';

type NotificationMeta = ApiListMeta & { unreadCount?: number };

export function NotificationsScreen() {
  const t = useTranslations('notification');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const fmt = useFormatters();
  const { can } = useSession();

  const [type, setType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const list = useList<NotificationDto>('/notifications', { sort: '-createdAt' });

  const meta = list.meta as NotificationMeta | undefined;
  const unreadCount = meta?.unreadCount ?? 0;

  const typeOptions = useMemo(
    () => NOTIFICATION_TYPES.map((v) => ({ value: v, label: tr(t, `types.${v}`, v) })),
    [t],
  );

  const applyFilters = useCallback(
    (nextType: string, nextUnread: string) => {
      list.setFilters({
        type: nextType || undefined,
        unreadOnly: nextUnread || undefined,
      });
    },
    [list],
  );

  const markRead = useCallback(
    async (n: NotificationDto) => {
      setBusyId(n.id);
      try {
        await apiPost(`/notifications/${n.id}/read`, {});
        list.reload();
      } catch {
        // يُظهره إعادة التحميل؛ لا نمنع الواجهة
      } finally {
        setBusyId(null);
      }
    },
    [list],
  );

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await apiPost('/notifications/read-all', {});
      list.reload();
    } catch {
      // تجاهل — سيظهر عند إعادة التحميل
    } finally {
      setMarkingAll(false);
    }
  }, [list]);

  const columns = useMemo<DataTableColumn<NotificationDto>[]>(() => {
    const base: DataTableColumn<NotificationDto>[] = [
      {
        key: 'type',
        header: tc('type'),
        cell: (n) => <span className="whitespace-nowrap text-xs text-muted-foreground">{tr(t, `types.${n.type}`, n.type)}</span>,
        showInCard: true,
      },
      {
        header: tr(t, 'titlePlural', 'الإشعار'),
        cell: (n) => (
          <span className="flex flex-col">
            <span className="font-medium">{n.title}</span>
            {n.body ? <span className="text-xs text-muted-foreground">{n.body}</span> : null}
          </span>
        ),
        showInCard: true,
      },
      {
        key: 'createdAt',
        header: tc('createdAt'),
        cell: (n) => <span className="ltr-field whitespace-nowrap text-xs tabular-nums">{fmt.dateTime(n.createdAt)}</span>,
      },
      {
        key: 'isRead',
        header: tr(t, 'status', 'الحالة'),
        cell: (n) => (
          <StatusBadge
            value={n.isRead ? 'READ' : 'UNREAD'}
            label={n.isRead ? tr(t, 'read', 'مقروء') : tr(t, 'unread', 'غير مقروء')}
          />
        ),
        showInCard: true,
      },
    ];
    base.push({
      header: tc('actions'),
      align: 'end',
      showInCard: false,
      cell: (n) =>
        n.isRead ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busyId === n.id}
            onClick={() => void markRead(n)}
          >
            <MailOpen className="size-4" aria-hidden />
            {tr(t, 'markRead', 'تعليم كمقروء')}
          </Button>
        ),
    });
    return base;
  }, [tc, t, fmt, busyId, markRead]);

  if (!can('notifications.view')) {
    return (
      <div>
        <PageHeader title={t('titlePlural')} />
        <div className="card p-0">
          <EmptyState title={tr(t, 'noAccess', 'لا تملك صلاحية عرض الإشعارات')} icon={<BellOff className="size-6" aria-hidden />} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('titlePlural')}
        subtitle={unreadCount > 0 ? t('unreadCount', { count: unreadCount }) : undefined}
        actions={
          unreadCount > 0 ? (
            <Button type="button" variant="outline" onClick={() => void markAllRead()} loading={markingAll}>
              <CheckCheck className="size-4" aria-hidden />
              {tr(t, 'markAllRead', 'تعليم الكل كمقروء')}
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Select
            aria-label={tc('type')}
            value={type}
            placeholder={`${tc('all')} — ${tc('type')}`}
            options={typeOptions}
            onChange={(e) => {
              setType(e.target.value);
              applyFilters(e.target.value, unreadOnly);
            }}
          />
        </div>
        <div className="w-44">
          <Select
            aria-label={tr(t, 'unreadOnly', 'غير المقروءة فقط')}
            value={unreadOnly}
            placeholder={tc('all')}
            options={[{ value: 'true', label: tr(t, 'unread', 'غير مقروء') }]}
            onChange={(e) => {
              setUnreadOnly(e.target.value);
              applyFilters(type, e.target.value);
            }}
          />
        </div>
        {type !== '' || unreadOnly !== '' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setType('');
              setUnreadOnly('');
              applyFilters('', '');
            }}
          >
            {tc('clear')}
          </Button>
        ) : null}
      </div>

      <div className="card p-0">
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          getRowId={(n) => n.id}
          loading={list.loading}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          sort={list.list.sort}
          onSortChange={list.setSort}
          emptyTitle={tr(t, 'noNotifications', 'لا توجد إشعارات')}
        />
        <Pagination
          page={list.list.page}
          totalPages={list.totalPages}
          total={list.total}
          pageSize={list.list.pageSize}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
      </div>
    </div>
  );
}
