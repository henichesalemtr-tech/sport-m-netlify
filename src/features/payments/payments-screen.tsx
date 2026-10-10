'use client';

/** قائمة المدفوعات — مرشحات (حالة/طريقة دفع/تاريخ من-إلى). */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import type { PaymentDto, PaymentMethodDto } from '@/shared/api/types';
import { useApi, useList, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { SearchInput } from '@/shared/ui-kit/search';
import { Select } from '@/shared/ui-kit/select';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatusBadge } from '@/shared/ui-kit/status-badge';

export function PaymentsScreen() {
  const t = useTranslations('payment');
  const tc = useTranslations('common');
  const ts = useTranslations('status');
  const errorText = useErrorText();
  const router = useRouter();
  const fmt = useFormatters();
  const { can } = useSession();

  const [filters, setFilters] = useState<{ status?: string; paymentMethodId?: string; dateFrom?: string; dateTo?: string }>({});

  const list = useList<PaymentDto>('/payments', { sort: '-paymentDate' });
  const methods = useApi<PaymentMethodDto[]>('/payment-methods');

  const applyFilters = (next: typeof filters) => {
    list.setFilters({
      status: next.status || undefined,
      paymentMethodId: next.paymentMethodId || undefined,
      dateFrom: next.dateFrom || undefined,
      dateTo: next.dateTo || undefined,
    });
  };

  const columns: DataTableColumn<PaymentDto>[] = [
    {
      key: 'transactionNo',
      header: t('transactionNo'),
      cell: (p) => <span className="ltr-field font-mono text-xs">{p.transactionNo}</span>,
      showInCard: true,
    },
    {
      header: t('athlete'),
      cell: (p) => (
        <span className="flex flex-col">
          <span className="font-medium">{p.athleteName}</span>
          <span className="ltr-field font-mono text-xs text-muted-foreground">{p.registrationNo}</span>
        </span>
      ),
      showInCard: true,
    },
    { key: 'paymentDate', header: t('paymentDate'), cell: (p) => fmt.date(p.paymentDate) },
    { header: t('method'), cell: (p) => p.paymentMethodName, showInCard: false },
    { key: 'amount', header: tc('amount'), cell: (p) => fmt.money(p.amount), align: 'end' },
    { header: t('netAmount'), cell: (p) => fmt.money(p.netAmount), align: 'end', showInCard: false },
    {
      header: t('receiptNo'),
      cell: (p) => (p.receiptNo ? <span className="ltr-field font-mono text-xs">{p.receiptNo}</span> : '—'),
      showInCard: false,
    },
    { key: 'status', header: tc('status'), cell: (p) => <StatusBadge value={p.status} />, showInCard: true },
  ];

  return (
    <div>
      <PageHeader
        title={t('titlePlural')}
        actions={
          can('payments.create') ? (
            <Button type="button" onClick={() => router.push('/payments/new')}>
              <Plus className="size-4" aria-hidden />
              {t('newPayment')}
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-52 flex-1">
          <SearchInput value={list.list.q} onSearch={list.setQ} placeholder={t('transactionNo') + '…'} />
        </div>
        <div className="w-36">
          <Select
            aria-label={tc('status')}
            value={filters.status ?? ''}
            placeholder={`${tc('all')} — ${tc('status')}`}
            options={[
              { value: 'COMPLETED', label: ts('COMPLETED') },
              { value: 'VOIDED', label: ts('VOIDED') },
            ]}
            onChange={(e) => {
              const next = { ...filters, status: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
        <div className="w-40">
          <Select
            aria-label={t('method')}
            value={filters.paymentMethodId ?? ''}
            placeholder={`${tc('all')} — ${t('method')}`}
            options={(methods.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
            onChange={(e) => {
              const next = { ...filters, paymentMethodId: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
        <div className="w-40">
          <DatePicker
            aria-label={tc('from')}
            value={filters.dateFrom ?? ''}
            onChange={(e) => {
              const next = { ...filters, dateFrom: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
        <div className="w-40">
          <DatePicker
            aria-label={tc('to')}
            value={filters.dateTo ?? ''}
            onChange={(e) => {
              const next = { ...filters, dateTo: e.target.value };
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
          getRowId={(p) => p.id}
          loading={list.loading}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          sort={list.list.sort}
          onSortChange={list.setSort}
          onRowClick={(p) => router.push(`/payments/${p.id}`)}
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
