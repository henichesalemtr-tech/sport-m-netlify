'use client';

/** قائمة الاشتراكات — مرشحات (حالة/رياضي/نشاط) ومؤشر انتهاء فعلي. */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import type { AthleteDto, SportDto, SubscriptionDto } from '@/shared/api/types';
import { useApi, useList, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { SUBSCRIPTION_STATUSES } from '@/shared/lib/options';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { SearchInput } from '@/shared/ui-kit/search';
import { Select } from '@/shared/ui-kit/select';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';

export function SubscriptionsScreen() {
  const t = useTranslations('subscription');
  const tc = useTranslations('common');
  const ts = useTranslations('status');
  const errorText = useErrorText();
  const router = useRouter();
  const fmt = useFormatters();
  const { can } = useSession();

  const [filters, setFilters] = useState<{ status?: string; athleteId?: string; sportId?: string }>({});

  const list = useList<SubscriptionDto>('/subscriptions', { sort: '-dueDate' });
  const sports = useApi<SportDto[]>('/sports', { params: { pageSize: 100 } });
  const athletes = useApi<AthleteDto[]>('/athletes', { params: { pageSize: 100 } });

  const applyFilters = (next: typeof filters) => {
    list.setFilters({
      status: next.status || undefined,
      athleteId: next.athleteId || undefined,
      sportId: next.sportId || undefined,
    });
  };

  const columns: DataTableColumn<SubscriptionDto>[] = [
    {
      header: t('athlete'),
      cell: (s) => (
        <span className="flex flex-col">
          <span className="font-medium">{s.athleteName}</span>
          <span className="ltr-field font-mono text-xs text-muted-foreground">{s.registrationNo}</span>
        </span>
      ),
      showInCard: true,
    },
    { header: t('subscriptionType'), cell: (s) => s.subscriptionTypeName },
    { header: t('group'), cell: (s) => s.groupName ?? '—', showInCard: false },
    {
      key: 'startDate',
      header: t('startDate'),
      cell: (s) => (
        <span className="text-xs">
          {fmt.date(s.startDate)} → {fmt.date(s.endDate)}
        </span>
      ),
      showInCard: false,
    },
    { key: 'dueDate', header: t('dueDate'), cell: (s) => fmt.date(s.dueDate), showInCard: false },
    { header: t('netAmount'), cell: (s) => fmt.money(s.netAmount), align: 'end', showInCard: false },
    { header: t('paidAmount'), cell: (s) => fmt.money(s.paidAmount), align: 'end', showInCard: false },
    {
      header: t('remaining'),
      cell: (s) => (
        <span className={s.remainingAmount !== '0' ? 'font-medium text-destructive tabular-nums' : 'tabular-nums'}>
          {fmt.money(s.remainingAmount)}
        </span>
      ),
      align: 'end',
    },
    {
      key: 'status',
      header: tc('status'),
      cell: (s) => (
        <span className="flex flex-wrap items-center gap-1">
          <StatusBadge value={s.status} />
          {s.effectivelyExpired && s.status !== 'CANCELLED' ? (
            <Badge label={t('effectivelyExpired')} tone="destructive" />
          ) : null}
        </span>
      ),
      showInCard: true,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('titlePlural')}
        actions={
          can('subscriptions.create') ? (
            <Button type="button" onClick={() => router.push('/subscriptions/new')}>
              <Plus className="size-4" aria-hidden />
              {t('newSubscription')}
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
            aria-label={tc('status')}
            value={filters.status ?? ''}
            placeholder={`${tc('all')} — ${tc('status')}`}
            options={SUBSCRIPTION_STATUSES.map((s) => ({ value: s, label: ts(s) }))}
            onChange={(e) => {
              const next = { ...filters, status: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
        <div className="w-48">
          <Select
            aria-label={t('athlete')}
            value={filters.athleteId ?? ''}
            placeholder={`${tc('all')} — ${t('athlete')}`}
            options={(athletes.data ?? []).map((a) => ({
              value: a.id,
              label: `${a.firstName} ${a.lastName} (${a.registrationNo})`,
            }))}
            onChange={(e) => {
              const next = { ...filters, athleteId: e.target.value };
              setFilters(next);
              applyFilters(next);
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
              applyFilters(next);
            }}
          />
        </div>
      </div>

      <div className="card p-0">
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          getRowId={(s) => s.id}
          loading={list.loading}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          sort={list.list.sort}
          onSortChange={list.setSort}
          onRowClick={(s) => router.push(`/subscriptions/${s.id}`)}
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
