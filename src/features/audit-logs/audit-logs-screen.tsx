'use client';

/**
 * AuditLogsScreen — سجل التدقيق (قراءة فقط) + مرشحات + نافذة تفاصيل قبل/بعد/بيانات وصفية.
 * عقد (src/app/api/v1/audit-logs/*):
 *  - GET /audit-logs (paginated) — filters action,entityType,entityId,userId,dateFrom,dateTo,requestId,q
 *  - لا عمليات كتابة (audit.view فقط).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AuditLogDto } from '@/shared/api/types';
import { useErrorText, useList } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Select } from '@/shared/ui-kit/select';
import { Input } from '@/shared/ui-kit/input';
import { SearchInput } from '@/shared/ui-kit/search';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { Badge } from '@/shared/ui-kit/status-badge';
import { Modal } from '@/shared/ui-kit/modal';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { Button } from '@/shared/ui-kit/button';

const AUDIT_ACTIONS = [
  'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE',
  'VOID', 'REFUND', 'VIEW_SENSITIVE', 'EXPORT', 'IMPORT', 'BACKUP',
  'RESTORE_BACKUP', 'ROLE_CHANGE', 'PERMISSION_CHANGE', 'SETTINGS_CHANGE',
  'PASSWORD_CHANGE',
] as const;

/** تنسيق JSON غير المعروف بأمان — لا نعرض كائنًا خامًا ولا ننهار. */
function prettyUnknown(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value.length > 0 ? value : '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? '—' : json;
  } catch {
    return '—';
  }
}

export function AuditLogsScreen() {
  const t = useTranslations('audit');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const fmt = useFormatters();
  const { can } = useSession();

  const [filters, setFilters] = useState<{ action?: string; entityType?: string; dateFrom?: string; dateTo?: string; requestId?: string }>({});
  const [detail, setDetail] = useState<AuditLogDto | null>(null);

  const list = useList<AuditLogDto>('/audit-logs', { sort: '-createdAt' });

  const applyFilters = (next: typeof filters) => {
    list.setFilters({
      action: next.action || undefined,
      entityType: next.entityType || undefined,
      dateFrom: next.dateFrom || undefined,
      dateTo: next.dateTo || undefined,
      requestId: next.requestId || undefined,
    });
  };

  const actionLabel = (action: string): string => tr(t, `actions.${action}`, action);

  const columns: DataTableColumn<AuditLogDto>[] = [
    {
      key: 'createdAt',
      header: tr(t, 'when', 'التوقيت'),
      cell: (r) => <span className="ltr-field whitespace-nowrap text-xs">{fmt.dateTime(r.createdAt)}</span>,
      showInCard: true,
    },
    {
      header: tr(t, 'user', 'المستخدم'),
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-medium">{r.userName ?? '—'}</span>
          {r.userRole ? <span className="text-xs text-muted-foreground">{actionRoleLabel(r.userRole)}</span> : null}
        </span>
      ),
      showInCard: true,
    },
    {
      key: 'action',
      header: tr(t, 'action', 'الإجراء'),
      cell: (r) => <Badge label={actionLabel(r.action)} tone="accent" />,
      showInCard: true,
    },
    { key: 'entityType', header: tr(t, 'entityType', 'نوع الكيان'), cell: (r) => r.entityType ?? '—', showInCard: true },
    {
      header: tr(t, 'entityId', 'معرّف الكيان'),
      cell: (r) => (r.entityId ? <span className="ltr-field font-mono text-xs">{r.entityId}</span> : '—'),
      showInCard: false,
    },
    {
      header: tr(t, 'ip', 'عنوان IP'),
      cell: (r) => (r.ipAddress ? <span className="ltr-field font-mono text-xs">{r.ipAddress}</span> : '—'),
      showInCard: false,
    },
    {
      header: tr(t, 'requestId', 'معرّف الطلب'),
      cell: (r) => (r.requestId ? <span className="ltr-field font-mono text-xs">{r.requestId}</span> : '—'),
      showInCard: false,
    },
  ];

  function actionRoleLabel(role: string): string {
    // أدوار النظام معروضة كنص خام عند غياب الترجمة
    return role;
  }

  if (!can('audit.view')) {
    return (
      <div>
        <PageHeader title={tr(t, 'title', 'سجل التدقيق')} />
        <EmptyState title={tr(t, 'noAccess', 'لا توجد صلاحية للاطلاع على سجل التدقيق')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={tr(t, 'title', 'سجل التدقيق')} subtitle={tr(t, 'subtitle', 'سجل دائم لكل العمليات الحساسة — للقراءة فقط')} />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="min-w-52 flex-1">
          <SearchInput value={list.list.q} onSearch={list.setQ} placeholder={tr(t, 'user', 'المستخدم') + ' / ' + tr(t, 'entityType', 'نوع الكيان') + '…'} />
        </div>
        <div className="w-48">
          <Select
            aria-label={tr(t, 'action', 'الإجراء')}
            value={filters.action ?? ''}
            placeholder={`${tc('all')} — ${tr(t, 'action', 'الإجراء')}`}
            options={AUDIT_ACTIONS.map((a) => ({ value: a, label: actionLabel(a) }))}
            onChange={(e) => {
              const next = { ...filters, action: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
        <div className="w-44">
          <Input
            aria-label={tr(t, 'entityType', 'نوع الكيان')}
            ltr
            value={filters.entityType ?? ''}
            placeholder={tr(t, 'entityType', 'نوع الكيان')}
            onChange={(e) => {
              const next = { ...filters, entityType: e.target.value };
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
        <div className="w-44">
          <Input
            aria-label={tr(t, 'requestId', 'معرّف الطلب')}
            ltr
            value={filters.requestId ?? ''}
            placeholder={tr(t, 'requestId', 'معرّف الطلب')}
            onChange={(e) => {
              const next = { ...filters, requestId: e.target.value };
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
          getRowId={(r) => r.id}
          loading={list.loading}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          sort={list.list.sort}
          onSortChange={list.setSort}
          onRowClick={(r) => setDetail(r)}
          emptyTitle={tc('noData')}
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

      <DetailModal
        row={detail}
        onClose={() => setDetail(null)}
        actionLabel={actionLabel}
        dateTime={(v) => fmt.dateTime(v)}
      />
    </div>
  );
}

function DetailModal({
  row,
  onClose,
  actionLabel,
  dateTime,
}: {
  row: AuditLogDto | null;
  onClose: () => void;
  actionLabel: (a: string) => string;
  dateTime: (v: string | Date) => string;
}) {
  const t = useTranslations('audit');
  const tc = useTranslations('common');

  return (
    <Modal
      open={row !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={tr(t, 'details', 'تفاصيل الحدث')}
      size="xl"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          {tc('close')}
        </Button>
      }
    >
      {row ? (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Row label={tr(t, 'when', 'التوقيت')} value={dateTime(row.createdAt)} ltr />
            <Row label={tr(t, 'user', 'المستخدم')} value={row.userName ?? '—'} />
            <Row label={tr(t, 'action', 'الإجراء')} value={actionLabel(row.action)} />
            <Row label={tr(t, 'entityType', 'نوع الكيان')} value={row.entityType ?? '—'} ltr />
            <Row label={tr(t, 'entityId', 'معرّف الكيان')} value={row.entityId ?? '—'} ltr />
            <Row label={tr(t, 'requestId', 'معرّف الطلب')} value={row.requestId ?? '—'} ltr />
            <Row label={tr(t, 'ip', 'عنوان IP')} value={row.ipAddress ?? '—'} ltr />
            <Row label={tc('email')} value={row.userEmail ?? '—'} ltr />
          </dl>

          {row.userAgent ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">User-Agent</p>
              <p className="ltr-field break-all rounded-md bg-muted/40 px-2 py-1 text-xs" dir="ltr">
                {row.userAgent}
              </p>
            </div>
          ) : null}

          <JsonBlock label={tr(t, 'before', 'قبل')} value={row.before} />
          <JsonBlock label={tr(t, 'after', 'بعد')} value={row.after} />
          <JsonBlock label={tr(t, 'metadata', 'بيانات وصفية')} value={row.metadata} />
        </div>
      ) : null}
    </Modal>
  );
}

function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-all text-end ${ltr ? 'ltr-field font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <pre
        dir="ltr"
        className="ltr-field max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 px-3 py-2 text-xs"
      >
        {prettyUnknown(value)}
      </pre>
    </div>
  );
}
