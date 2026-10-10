'use client';

/**
 * BackupsScreen — قائمة النسخ + إنشاء + تنزيل + استعادة (تأكيد مكتوب RESTORE + سبب).
 * عقود (src/app/api/v1/backups/*):
 *  - GET /backups (paginated) — filter kind?
 *  - POST /backups — {kind?('manual'|'daily'|'weekly'|'monthly'), reason?(<=500)} — backup.manage (بطيء)
 *  - GET /backups/[id]/download — ثنائي
 *  - POST /backups/restore — {backupId, confirm:'RESTORE', reason(10..500)} — backup.manage
 * ملاحظة: sizeBytes يصل كنص/رقم كبير — يُحوَّل إلى Number قبل التنسيق.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Plus, RotateCcw } from 'lucide-react';
import { apiPost, downloadFile, newIdempotencyKey } from '@/shared/api/client';
import type { BackupDto } from '@/shared/api/types';
import { useErrorText, useList } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { formatBytes } from '@/shared/lib/format';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Select } from '@/shared/ui-kit/select';
import { Textarea } from '@/shared/ui-kit/textarea';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { Badge } from '@/shared/ui-kit/status-badge';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { Field, ErrorText } from '@/shared/ui-kit/form';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { useToast } from '@/shared/ui-kit/toast';

const KINDS = ['manual', 'daily', 'weekly', 'monthly'] as const;

function toBytes(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function BackupsScreen() {
  const t = useTranslations('backup');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can } = useSession();

  const [filters, setFilters] = useState<{ kind?: string }>({});

  const list = useList<BackupDto>('/backups', { sort: '-createdAt' });

  const [createOpen, setCreateOpen] = useState(false);
  const [restoring, setRestoring] = useState<BackupDto | null>(null);

  const applyFilters = (next: typeof filters) => {
    list.setFilters({ kind: next.kind || undefined });
  };

  const onDownload = (row: BackupDto) => {
    void downloadFile(`backups/${row.id}/download`, undefined, row.fileName).catch((e: unknown) => toast.error(errorText(e)));
  };

  const kindLabel = (kind: string): string => tr(t, `kinds.${kind}`, kind);

  const columns: DataTableColumn<BackupDto>[] = [
    {
      key: 'createdAt',
      header: tc('createdAt'),
      cell: (r) => <span className="ltr-field whitespace-nowrap text-xs">{fmt.dateTime(r.createdAt)}</span>,
      showInCard: true,
    },
    {
      header: tr(t, 'fileName', 'اسم الملف'),
      cell: (r) => (
        <span className="ltr-field inline-flex max-w-64 truncate text-xs" dir="ltr" title={r.fileName}>
          {r.fileName}
        </span>
      ),
      showInCard: true,
    },
    {
      key: 'kind',
      header: tr(t, 'kind', 'النوع'),
      cell: (r) => <Badge label={kindLabel(r.kind)} tone="accent" />,
      showInCard: true,
    },
    {
      header: tr(t, 'size', 'الحجم'),
      cell: (r) => <span className="tabular-nums ltr-field">{formatBytes(toBytes(r.sizeBytes))}</span>,
      align: 'end',
      showInCard: true,
    },
    {
      header: tr(t, 'checksum', 'البصمة'),
      cell: (r) =>
        r.checksum ? (
          <span className="ltr-field font-mono text-xs" dir="ltr" title={r.checksum}>
            {r.checksum.slice(0, 12)}…
          </span>
        ) : (
          '—'
        ),
      showInCard: false,
    },
    {
      header: tr(t, 'createdBy', 'أنشأها'),
      cell: (r) => r.createdBy ?? '—',
      showInCard: false,
    },
    {
      header: tr(t, 'restoredAt', 'تاريخ الاستعادة'),
      cell: (r) => (r.restoredAt ? fmt.dateTime(r.restoredAt) : '—'),
      showInCard: false,
    },
    {
      header: tc('actions'),
      align: 'end',
      showInCard: true,
      cell: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
          <Button type="button" size="sm" variant="ghost" onClick={() => onDownload(r)} title={tr(t, 'download', 'تنزيل')}>
            <Download className="size-4" aria-hidden />
            {tr(t, 'download', 'تنزيل')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRestoring(r)} title={tr(t, 'restore', 'استعادة')}>
            <RotateCcw className="size-4" aria-hidden />
            {tr(t, 'restore', 'استعادة')}
          </Button>
        </div>
      ),
    },
  ];

  if (!can('backup.manage')) {
    return (
      <div>
        <PageHeader title={tr(t, 'title', 'النسخ الاحتياطي')} />
        <EmptyState title={tr(t, 'noAccess', 'لا توجد صلاحية لإدارة النسخ الاحتياطية')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={tr(t, 'title', 'النسخ الاحتياطي')}
        subtitle={tr(t, 'subtitle', 'إنشاء نسخ احتياطية واستعادتها — عمليات حساسة')}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {tr(t, 'create', 'إنشاء نسخة الآن')}
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Select
            aria-label={tr(t, 'kind', 'النوع')}
            value={filters.kind ?? ''}
            placeholder={`${tc('all')} — ${tr(t, 'kind', 'النوع')}`}
            options={KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
            onChange={(e) => {
              const next = { ...filters, kind: e.target.value };
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

      <CreateBackupModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={list.reload}
      />

      <RestoreModal
        row={restoring}
        onClose={() => setRestoring(null)}
        onRestored={list.reload}
      />
    </div>
  );
}

function CreateBackupModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations('backup');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const toast = useToast();

  const [kind, setKind] = useState<string>('manual');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { kind };
      const trimmed = reason.trim();
      if (trimmed) body.reason = trimmed;
      await apiPost('/backups', body, { idempotencyKey: newIdempotencyKey() });
      toast.success(tr(t, 'created', 'تم إنشاء النسخة الاحتياطية'));
      onOpenChange(false);
      setReason('');
      onCreated();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
      title={tr(t, 'create', 'إنشاء نسخة الآن')}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc('cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} loading={busy}>
            {busy ? tr(t, 'creating', 'جارٍ إنشاء النسخة...') : tc('confirm')}
          </Button>
        </>
      }
    >
      {error ? <ErrorText message={error} /> : null}
      <div className="space-y-4">
        <Field label={tr(t, 'kind', 'النوع')} htmlFor="bk-kind">
          <Select
            id="bk-kind"
            value={kind}
            options={KINDS.map((k) => ({ value: k, label: tr(t, `kinds.${k}`, k) }))}
            onChange={(e) => setKind(e.target.value)}
          />
        </Field>
        <Field label={tc('reason')} htmlFor="bk-reason" optional>
          <Textarea id="bk-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function RestoreModal({
  row,
  onClose,
  onRestored,
}: {
  row: BackupDto | null;
  onClose: () => void;
  onRestored: () => void;
}) {
  const t = useTranslations('backup');
  const tc = useTranslations('common');
  const tv = useTranslations('ui.validation');
  const errorText = useErrorText();
  const toast = useToast();

  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setConfirmText('');
    setReason('');
    setError(null);
  };

  const trimmedReason = reason.trim();
  const reasonOk = trimmedReason.length >= 10 && trimmedReason.length <= 500;

  const submit = async () => {
    if (!row) return;
    if (confirmText !== 'RESTORE') {
      setError(tr(t, 'confirmWord', 'اكتب RESTORE للتأكيد'));
      return;
    }
    if (!reasonOk) {
      setError(`${tc('reason')}: ${tv('minLength', { min: 10 })}`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await apiPost(
        '/backups/restore',
        { backupId: row.id, confirm: 'RESTORE', reason: trimmedReason },
        { idempotencyKey: newIdempotencyKey() },
      );
      toast.success(tr(t, 'restored', 'تمت الاستعادة بنجاح'));
      reset();
      onRestored();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const message = (
    <div className="space-y-3">
      <p className="text-sm font-medium">{tr(t, 'restoreWarning', 'عملية خطيرة: ستُستبدل البيانات الحالية ببيانات النسخة. يُنشأ تلقائيًا نسخة قبل الاستعادة.')}</p>
      <p className="ltr-field break-all text-xs text-muted-foreground" dir="ltr">
        {row?.fileName ?? ''}
      </p>
      {error ? <ErrorText message={error} /> : null}
      <Field label={tr(t, 'restoreReason', 'سبب الاستعادة (10 أحرف على الأقل)')} htmlFor="rs-reason" required>
        <Textarea
          id="rs-reason"
          rows={3}
          maxLength={500}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </div>
  );

  return (
    <ConfirmDialog
      open={row !== null}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) {
          reset();
          onClose();
        }
      }}
      title={tr(t, 'restoreTitle', 'استعادة نسخة احتياطية')}
      message={message}
      confirmLabel={tr(t, 'restore', 'استعادة')}
      tone="danger"
      loading={busy}
      requireText={tr(t, 'confirmWord', 'اكتب RESTORE للتأكيد')}
      requireTextValue="RESTORE"
      textValue={confirmText}
      onTextValueChange={setConfirmText}
      onConfirm={() => void submit()}
    />
  );
}
