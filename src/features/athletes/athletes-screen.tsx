'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { apiDelete, apiPost, downloadFile } from '@/shared/api/client';
import type { AthleteDto, SportDto } from '@/shared/api/types';
import { useApi, useList, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { GENDERS, ATHLETE_STATUSES } from '@/shared/lib/options';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { SearchInput } from '@/shared/ui-kit/search';
import { Select } from '@/shared/ui-kit/select';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { useToast } from '@/shared/ui-kit/toast';
import { Checkbox } from '@/shared/ui-kit/date-picker';

export function AthletesScreen() {
  const t = useTranslations('athlete');
  const tc = useTranslations('common');
  const ts = useTranslations('status');
  const tt = useTranslations();
  const errorText = useErrorText();
  const toast = useToast();
  const router = useRouter();
  const fmt = useFormatters();
  const { can } = useSession();

  const [filters, setFilters] = useState<{ status?: string; sportId?: string; gender?: string }>({});
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [deleting, setDeleting] = useState<AthleteDto | null>(null);
  const [restoring, setRestoring] = useState<AthleteDto | null>(null);

  const list = useList<AthleteDto>('/athletes', { sort: '-createdAt' });
  const sports = useApi<SportDto[]>('/sports', { params: { pageSize: 100 } });

  const applyFilters = (next: typeof filters, deleted: boolean) => {
    const params: Record<string, string | undefined> = {
      status: next.status || undefined,
      sportId: next.sportId || undefined,
      gender: next.gender || undefined,
      includeDeleted: deleted ? 'true' : undefined,
    };
    list.setFilters(params);
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/athletes/${deleting.id}`, { version: deleting.version });
      toast.success(t('titlePlural') + ' — ' + tc('deleted'));
      list.reload();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setDeleting(null);
    }
  };

  const doRestore = async () => {
    if (!restoring) return;
    try {
      await apiPost(`/athletes/${restoring.id}/restore`, { version: restoring.version });
      toast.success(tc('restore'));
      list.reload();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setRestoring(null);
    }
  };

  const doExport = async () => {
    try {
      await downloadFile('/reports/athletes/export', {
        format: 'csv',
        ...filters,
      });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const columns: DataTableColumn<AthleteDto>[] = [
    {
      key: 'registrationNo',
      header: t('registrationNo'),
      cell: (a) => <span className="ltr-field font-mono text-xs">{a.registrationNo}</span>,
    },
    {
      key: 'firstName',
      header: tc('fullName'),
      cell: (a) => (
        <span className="flex items-center gap-2">
          {a.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.photoUrl} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {a.firstName[0]}
              {a.lastName[0]}
            </span>
          )}
          <span className="font-medium">
            {a.firstName} {a.lastName}
          </span>
          {a.deletedAt ? <StatusBadge value="INACTIVE" label={tc('deleted')} tone="muted" /> : null}
        </span>
      ),
      showInCard: true,
    },
    { key: 'birthDate', header: t('birthDate'), cell: (a) => fmt.date(a.birthDate), showInCard: false },
    { header: t('gender'), cell: (a) => (a.gender === 'MALE' ? tc('male') : tc('female')), showInCard: false },
    { header: t('sport'), cell: (a) => a.sport?.name ?? '—' },
    { header: t('ageCategory'), cell: (a) => a.ageCategory?.name ?? '—', showInCard: false },
    { header: tc('phone'), cell: (a) => (a.phone ? <span className="ltr-field">{a.phone}</span> : '—'), showInCard: false },
    { key: 'status', header: tc('status'), cell: (a) => <StatusBadge value={a.status} /> },
    {
      header: tc('actions'),
      align: 'end',
      cell: (a) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
          {a.deletedAt ? (
            can('athletes.restore') ? (
              <Button type="button" size="icon-sm" variant="ghost" aria-label={tc('restore')} onClick={() => setRestoring(a)}>
                <RotateCcw className="size-4" aria-hidden />
              </Button>
            ) : null
          ) : (
            <>
              {can('athletes.edit') ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => router.push(`/athletes/${a.id}/edit`)}>
                  {tc('edit')}
                </Button>
              ) : null}
              {can('athletes.delete') ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={tc('delete')}
                  onClick={() => setDeleting(a)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              ) : null}
            </>
          )}
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
          <>
            {can('athletes.export') ? (
              <Button type="button" variant="outline" onClick={() => void doExport()}>
                <Download className="size-4" aria-hidden />
                {tc('export')}
              </Button>
            ) : null}
            {can('athletes.create') ? (
              <Button type="button" onClick={() => router.push('/athletes/new')}>
                <Plus className="size-4" aria-hidden />
                {t('newAthlete')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-52 flex-1">
          <SearchInput value={list.list.q} onSearch={list.setQ} placeholder={t('titlePlural') + '…'} />
        </div>
        <div className="w-40">
          <Select
            aria-label={t('status')}
            value={filters.status ?? ''}
            placeholder={`${tc('all')} — ${t('status')}`}
            options={ATHLETE_STATUSES.map((s) => ({ value: s, label: ts(s) }))}
            onChange={(e) => {
              const next = { ...filters, status: e.target.value };
              setFilters(next);
              applyFilters(next, includeDeleted);
            }}
          />
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
              applyFilters(next, includeDeleted);
            }}
          />
        </div>
        <div className="w-36">
          <Select
            aria-label={t('gender')}
            value={filters.gender ?? ''}
            placeholder={`${tc('all')} — ${t('gender')}`}
            options={GENDERS.map((g) => ({ value: g.value, label: tt(g.labelKey) }))}
            onChange={(e) => {
              const next = { ...filters, gender: e.target.value };
              setFilters(next);
              applyFilters(next, includeDeleted);
            }}
          />
        </div>
        {can('athletes.restore') ? (
          <Checkbox
            label={tc('deleted')}
            checked={includeDeleted}
            onChange={(e) => {
              setIncludeDeleted(e.target.checked);
              applyFilters(filters, e.target.checked);
            }}
          />
        ) : null}
      </div>

      <div className="card p-0">
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          getRowId={(a) => a.id}
          loading={list.loading}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          sort={list.list.sort}
          onSortChange={list.setSort}
          onRowClick={(a) => router.push(`/athletes/${a.id}`)}
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
      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(o) => !o && setRestoring(null)}
        title={tc('restore')}
        message={t('restoreConfirm')}
        tone="primary"
        confirmLabel={tc('restore')}
        onConfirm={() => void doRestore()}
      />
    </div>
  );
}
