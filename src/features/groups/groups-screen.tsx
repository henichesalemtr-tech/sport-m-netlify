'use client';

/** قائمة المجموعات — مؤشر سعة، مرشحات (نشاط/مدرب/حالة)، إنشاء/تعديل/حذف بالصلاحية. */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { apiDelete } from '@/shared/api/client';
import type { CoachDto, GroupDto, SportDto } from '@/shared/api/types';
import { useApi, useList, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { GROUP_STATUSES } from '@/shared/lib/options';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { SearchInput } from '@/shared/ui-kit/search';
import { Select } from '@/shared/ui-kit/select';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { useToast } from '@/shared/ui-kit/toast';
import { cn } from '@/shared/ui-kit/utils';

function membersOf(g: GroupDto): number {
  return g.membersCount ?? g._count?.members ?? 0;
}

export function GroupsScreen() {
  const t = useTranslations('group');
  const tc = useTranslations('common');
  const ts = useTranslations('status');
  const errorText = useErrorText();
  const toast = useToast();
  const router = useRouter();
  const fmt = useFormatters();
  const { can } = useSession();

  const [filters, setFilters] = useState<{ sportId?: string; coachId?: string; status?: string }>({});
  const [deleting, setDeleting] = useState<GroupDto | null>(null);

  const list = useList<GroupDto>('/groups', { sort: 'name' });
  const sports = useApi<SportDto[]>('/sports', { params: { pageSize: 100 } });
  const coaches = useApi<CoachDto[]>('/coaches', { params: { pageSize: 100, isActive: 'true' } });

  const applyFilters = (next: typeof filters) => {
    list.setFilters({
      sportId: next.sportId || undefined,
      coachId: next.coachId || undefined,
      status: next.status || undefined,
    });
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/groups/${deleting.id}`, { version: deleting.version });
      toast.success(tc('deleted'));
      list.reload();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setDeleting(null);
    }
  };

  const columns: DataTableColumn<GroupDto>[] = [
    {
      key: 'name',
      header: tc('name'),
      cell: (g) => (
        <span className="flex flex-col">
          <span className="font-medium">{g.name}</span>
          <span className="ltr-field font-mono text-xs text-muted-foreground">{g.code}</span>
        </span>
      ),
      showInCard: true,
    },
    { header: t('sport'), cell: (g) => g.sport?.name ?? '—' },
    {
      header: t('coach'),
      cell: (g) => (g.coach ? `${g.coach.firstName} ${g.coach.lastName}` : '—'),
      showInCard: false,
    },
    { header: t('venue'), cell: (g) => g.venue?.name ?? '—', showInCard: false },
    {
      header: t('capacity'),
      cell: (g) => {
        const current = membersOf(g);
        const full = current >= g.maxCapacity;
        return (
          <span className="flex flex-col gap-1">
            <span className={cn('text-xs tabular-nums', full && 'font-bold text-warning')}>
              {t('capacityUsage', { current: fmt.number(current), max: fmt.number(g.maxCapacity) })}
              {full ? ` — ${t('full')}` : ''}
            </span>
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className={cn('block h-full rounded-full', full ? 'bg-warning' : 'bg-primary')}
                style={{ width: `${Math.min(100, g.maxCapacity > 0 ? (current / g.maxCapacity) * 100 : 0)}%` }}
              />
            </span>
          </span>
        );
      },
      showInCard: true,
    },
    { key: 'status', header: tc('status'), cell: (g) => <StatusBadge value={g.status} /> },
    {
      header: tc('actions'),
      align: 'end',
      cell: (g) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
          {can('groups.edit') ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => router.push(`/groups/${g.id}/edit`)}>
              {tc('edit')}
            </Button>
          ) : null}
          {can('groups.delete') ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-destructive"
              aria-label={tc('delete')}
              onClick={() => setDeleting(g)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      ),
      showInCard: true,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('titlePlural')}
        actions={
          can('groups.create') ? (
            <Button type="button" onClick={() => router.push('/groups/new')}>
              <Plus className="size-4" aria-hidden />
              {t('newGroup')}
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-52 flex-1">
          <SearchInput value={list.list.q} onSearch={list.setQ} placeholder={t('titlePlural') + '…'} />
        </div>
        <div className="w-40">
          <Select
            aria-label={t('sport')}
            value={filters.sportId ?? ''}
            placeholder={`${tc('all')} — ${t('sport')}`}
            options={(sports.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            onChange={(e) => {
              const next = { ...filters, sportId: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
        <div className="w-40">
          <Select
            aria-label={t('coach')}
            value={filters.coachId ?? ''}
            placeholder={`${tc('all')} — ${t('coach')}`}
            options={(coaches.data ?? []).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
            onChange={(e) => {
              const next = { ...filters, coachId: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
        <div className="w-36">
          <Select
            aria-label={tc('status')}
            value={filters.status ?? ''}
            placeholder={`${tc('all')} — ${tc('status')}`}
            options={GROUP_STATUSES.map((s) => ({ value: s, label: ts(s) }))}
            onChange={(e) => {
              const next = { ...filters, status: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
      </div>

      <div className="card p-0">
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          getRowId={(g) => g.id}
          loading={list.loading}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          sort={list.list.sort}
          onSortChange={list.setSort}
          onRowClick={(g) => router.push(`/groups/${g.id}`)}
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

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={tc('delete')}
        message={t('deleteConfirm')}
        confirmLabel={tc('delete')}
        onConfirm={() => void doDelete()}
      />
    </div>
  );
}
