'use client';

/**
 * DocumentsScreen — تبويبان: الوثائق (قائمة + رفع/تنزيل/معاينة/تعديل انتهاء/حذف مرن)
 * وأنواع الوثائق (CRUD).
 *
 * عقود (تمت قراءتها من src/app/api/v1/documents/*):
 *  - GET /documents (paginated) — filters athleteId,documentTypeId,status('ACTIVE'|'EXPIRED'|'DELETED'),expiringInDays
 *  - POST /documents — multipart/form-data (الحقل: file + athleteId + documentTypeId + expiryDate?) — documents.upload
 *  - GET /documents/[id]/download?disposition=attachment|inline — ثنائي
 *  - PATCH /documents/[id] — {expiryDate: dateOnly|null} — documents.upload
 *  - DELETE /documents/[id] — حذف مرن (بلا version/جسم) — documents.delete
 * عنصر القائمة يصل مُسطَّحًا (athleteName/documentTypeName/sizeBytes:number).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Eye, Pencil, Trash2, Upload } from 'lucide-react';
import { ApiClientError, apiDelete, apiPatch, apiUpload, downloadFile } from '@/shared/api/client';
import { useApi, useErrorText, useList } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { formatBytes } from '@/shared/lib/format';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Select, type SelectOption } from '@/shared/ui-kit/select';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { Field, ErrorText } from '@/shared/ui-kit/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui-kit/tabs';
import { FileUpload } from '@/shared/ui-kit/file-upload';
import { useToast } from '@/shared/ui-kit/toast';
import { AthletePicker, type AthleteSelection } from '@/features/evaluations/athlete-picker';
import { DocumentTypesScreen } from '@/features/documents/document-types-screen';

interface DocumentRow {
  id: string;
  athleteId: string;
  athleteName: string;
  registrationNo: string;
  documentTypeId: string;
  documentTypeName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  expiryDate: string | null;
  status: string;
  createdAt: string;
}

interface DocumentTypeOption {
  id: string;
  name: string;
  isActive: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'نشط',
  EXPIRED: 'منتهية',
  DELETED: 'محذوفة',
};

export function DocumentsScreen() {
  const t = useTranslations('document');
  const { can, canAny } = useSession();

  if (!canAny(['documents.view', 'documents.upload', 'documents.delete', 'settings.manage'])) {
    return (
      <div>
        <PageHeader title={tr(t, 'titlePlural', 'الوثائق')} />
        <p className="text-sm text-muted-foreground">{tr(t, 'noAccess', 'لا توجد صلاحية للاطلاع على الوثائق')}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={tr(t, 'titlePlural', 'الوثائق')} />
      <Tabs defaultValue="documents">
        <TabsList className="mb-4">
          <TabsTrigger value="documents">{tr(t, 'titlePlural', 'الوثائق')}</TabsTrigger>
          {can('documents.view') ? (
            <TabsTrigger value="types">{tr(t, 'typesTab', 'أنواع الوثائق')}</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="documents">
          <DocumentsList />
        </TabsContent>
        {can('documents.view') ? (
          <TabsContent value="types">
            <DocumentTypesScreen />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function DocumentsList() {
  const t = useTranslations('document');
  const tc = useTranslations('common');
  const ts = useTranslations('status');
  const tToast = useTranslations('ui.toast');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can } = useSession();

  const canUpload = can('documents.upload');
  const canDelete = can('documents.delete');

  const list = useList<DocumentRow>('/documents', { sort: '-createdAt' });
  const types = useApi<DocumentTypeOption[]>('/document-types', {
    params: { pageSize: 100 },
    enabled: can('documents.view'),
  });
  const typeOptions: SelectOption[] = useMemo(
    () => (types.data ?? []).filter((x) => x.isActive).map((x) => ({ value: x.id, label: x.name })),
    [types.data],
  );

  const [athlete, setAthlete] = useState<AthleteSelection | null>(null);
  const [filters, setFilters] = useState<{ documentTypeId?: string; status?: string; expiringInDays?: string }>({});

  const applyFilters = (nextAthlete: AthleteSelection | null, next: typeof filters) => {
    list.setFilters({
      athleteId: nextAthlete?.id || undefined,
      documentTypeId: next.documentTypeId || undefined,
      status: next.status || undefined,
      expiringInDays: next.expiringInDays || undefined,
    });
  };

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingExpiry, setEditingExpiry] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState<DocumentRow | null>(null);

  const onDownload = (row: DocumentRow) => {
    void downloadFile(`documents/${row.id}/download`, { disposition: 'attachment' }, row.originalName).catch((e: unknown) =>
      toast.error(errorText(e)),
    );
  };

  const columns: DataTableColumn<DocumentRow>[] = [
    {
      header: tr(t, 'athlete', 'الرياضي'),
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-medium">{r.athleteName}</span>
          <span className="ltr-field font-mono text-xs text-muted-foreground">{r.registrationNo}</span>
        </span>
      ),
      showInCard: true,
    },
    { header: tr(t, 'documentType', 'نوع الوثيقة'), cell: (r) => r.documentTypeName, showInCard: true },
    {
      header: tr(t, 'originalName', 'اسم الملف'),
      cell: (r) => (
        <span className="ltr-field inline-flex max-w-56 items-center gap-1 truncate text-xs" dir="ltr" title={r.originalName}>
          {r.originalName}
        </span>
      ),
      showInCard: false,
    },
    {
      header: tr(t, 'size', 'الحجم'),
      cell: (r) => <span className="tabular-nums ltr-field">{formatBytes(Number(r.sizeBytes))}</span>,
      align: 'end',
      showInCard: true,
    },
    {
      key: 'expiryDate',
      header: tr(t, 'expiryDate', 'تاريخ الانتهاء'),
      cell: (r) => (r.expiryDate ? fmt.date(r.expiryDate) : <span className="text-muted-foreground">{tr(t, 'noExpiry', 'بلا انتهاء')}</span>),
      showInCard: true,
    },
    {
      header: tc('status'),
      cell: (r) => (
        <StatusBadge
          value={r.status}
          label={r.status === 'ACTIVE' ? ts('ACTIVE') : r.status === 'EXPIRED' ? ts('EXPIRED') : STATUS_LABELS[r.status] ?? r.status}
        />
      ),
      showInCard: true,
    },
    {
      header: tc('actions'),
      align: 'end',
      showInCard: true,
      cell: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
          <a
            href={`/api/v1/documents/${r.id}/download?disposition=inline`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 min-h-9 items-center gap-1 rounded-md px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={tr(t, 'view', 'معاينة')}
          >
            <Eye className="size-4" aria-hidden />
            {tr(t, 'view', 'معاينة')}
          </a>
          <Button type="button" size="sm" variant="ghost" onClick={() => onDownload(r)} title={tr(t, 'download', 'تنزيل')}>
            <Download className="size-4" aria-hidden />
            {tr(t, 'download', 'تنزيل')}
          </Button>
          {canUpload ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingExpiry(r)} title={tc('edit')}>
              <Pencil className="size-4" aria-hidden />
              {tc('edit')}
            </Button>
          ) : null}
          {canDelete ? (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(r)} title={tc('delete')}>
              <Trash2 className="size-4" aria-hidden />
              {tc('delete')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/documents/${deleting.id}`);
      toast.success(tToast('deleted'));
      list.reload();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <div className="mb-3">
        {canUpload ? (
          <Button type="button" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" aria-hidden />
            {tr(t, 'upload', 'رفع وثيقة')}
          </Button>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-64">
          <AthletePicker
            label={tr(t, 'athlete', 'الرياضي')}
            value={athlete}
            enabled={can('athletes.view')}
            onChange={(next) => {
              setAthlete(next);
              applyFilters(next, filters);
            }}
          />
        </div>
        <div className="w-48">
          <Select
            aria-label={tr(t, 'documentType', 'نوع الوثيقة')}
            value={filters.documentTypeId ?? ''}
            placeholder={`${tc('all')} — ${tr(t, 'documentType', 'نوع الوثيقة')}`}
            options={typeOptions}
            onChange={(e) => {
              const next = { ...filters, documentTypeId: e.target.value };
              setFilters(next);
              applyFilters(athlete, next);
            }}
          />
        </div>
        <div className="w-40">
          <Select
            aria-label={tc('status')}
            value={filters.status ?? ''}
            placeholder={`${tc('all')} — ${tc('status')}`}
            options={[
              { value: 'ACTIVE', label: ts('ACTIVE') },
              { value: 'EXPIRED', label: ts('EXPIRED') },
              { value: 'DELETED', label: STATUS_LABELS.DELETED ?? 'DELETED' },
            ]}
            onChange={(e) => {
              const next = { ...filters, status: e.target.value };
              setFilters(next);
              applyFilters(athlete, next);
            }}
          />
        </div>
        <div className="w-44">
          <Select
            aria-label={tr(t, 'expiring', 'قاربت على الانتهاء')}
            value={filters.expiringInDays ?? ''}
            placeholder={tr(t, 'expiring', 'قاربت على الانتهاء')}
            options={[
              { value: '7', label: tr(t, 'expiringInDays', 'تنتهي خلال {days} يومًا', { days: 7 }) },
              { value: '30', label: tr(t, 'expiringInDays', 'تنتهي خلال {days} يومًا', { days: 30 }) },
              { value: '60', label: tr(t, 'expiringInDays', 'تنتهي خلال {days} يومًا', { days: 60 }) },
              { value: '90', label: tr(t, 'expiringInDays', 'تنتهي خلال {days} يومًا', { days: 90 }) },
            ]}
            onChange={(e) => {
              const next = { ...filters, expiringInDays: e.target.value };
              setFilters(next);
              applyFilters(athlete, next);
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

      {canUpload ? (
        <UploadModal
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          typeOptions={typeOptions}
          onSaved={list.reload}
        />
      ) : null}

      {editingExpiry ? (
        <EditExpiryModal
          row={editingExpiry}
          onOpenChange={(o) => {
            if (!o) setEditingExpiry(null);
          }}
          onSaved={list.reload}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={tc('delete')}
        message={deleting ? `${deleting.athleteName} — ${deleting.originalName} — ${tr(t, 'deleteConfirm', 'هل تريد حذف هذه الوثيقة؟')}` : ''}
        confirmLabel={tc('delete')}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function UploadModal({
  open,
  onOpenChange,
  typeOptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  typeOptions: SelectOption[];
  onSaved: () => void;
}) {
  const t = useTranslations('document');
  const tc = useTranslations('common');
  const tToast = useTranslations('ui.toast');
  const tv = useTranslations('ui.validation');
  const errorText = useErrorText();
  const toast = useToast();
  const { can } = useSession();

  const [athlete, setAthlete] = useState<AthleteSelection | null>(null);
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setAthlete(null);
    setDocumentTypeId('');
    setExpiryDate('');
    setFile(null);
    setFormError(null);
  };

  const submit = async () => {
    setFormError(null);
    if (!athlete) {
      setFormError(`${tr(t, 'athlete', 'الرياضي')}: ${tv('required')}`);
      return;
    }
    if (!documentTypeId) {
      setFormError(`${tr(t, 'documentType', 'نوع الوثيقة')}: ${tv('required')}`);
      return;
    }
    if (!file) {
      setFormError(`${tc('upload')}: ${tv('required')}`);
      return;
    }
    const form = new FormData();
    form.set('file', file);
    form.set('athleteId', athlete.id);
    form.set('documentTypeId', documentTypeId);
    if (expiryDate) form.set('expiryDate', expiryDate);

    setBusy(true);
    try {
      await apiUpload<DocumentRow>('/documents', form);
      toast.success(tToast('created'));
      reset();
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiClientError && e.fieldErrors) {
        const first = Object.values(e.fieldErrors)[0];
        setFormError(first && first.length > 0 ? first[0]! : errorText(e));
      } else {
        setFormError(errorText(e));
      }
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
      title={tr(t, 'uploadDocument', 'رفع وثيقة رياضي')}
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc('cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} loading={busy}>
            {tc('save')}
          </Button>
        </>
      }
    >
      {formError ? (
        <div className="mb-3">
          <ErrorText message={formError} />
        </div>
      ) : null}

      <div className="space-y-4">
        <AthletePicker
          label={tr(t, 'athlete', 'الرياضي')}
          value={athlete}
          enabled={can('athletes.view')}
          onChange={setAthlete}
        />

        <Field label={tr(t, 'documentType', 'نوع الوثيقة')} htmlFor="doc-type" required>
          <Select
            id="doc-type"
            value={documentTypeId}
            placeholder={tc('none')}
            options={typeOptions}
            onChange={(e) => setDocumentTypeId(e.target.value)}
          />
        </Field>

        <Field label={tr(t, 'expiryDate', 'تاريخ الانتهاء')} htmlFor="doc-expiry" optional>
          <DatePicker id="doc-expiry" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </Field>

        <FileUpload
          label={tc('upload')}
          file={file}
          onFileChange={setFile}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          maxSizeMb={10}
          uploading={busy}
          disabled={busy}
        />
      </div>
    </Modal>
  );
}

function EditExpiryModal({
  row,
  onOpenChange,
  onSaved,
}: {
  row: DocumentRow;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations('document');
  const tc = useTranslations('common');
  const tToast = useTranslations('ui.toast');
  const errorText = useErrorText();
  const toast = useToast();

  const [value, setValue] = useState(row.expiryDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiPatch(`/documents/${row.id}`, { expiryDate: value ? value : null });
      toast.success(tToast('updated'));
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
      title={`${tr(t, 'expiryDate', 'تاريخ الانتهاء')} — ${row.originalName}`}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc('cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} loading={busy}>
            {tc('save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorText message={error} /> : null}
      <div className="space-y-3">
        <Field label={tr(t, 'expiryDate', 'تاريخ الانتهاء')} htmlFor="edit-expiry" optional>
          <DatePicker id="edit-expiry" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Button type="button" variant="ghost" size="sm" onClick={() => setValue('')} disabled={busy}>
          {tr(t, 'noExpiry', 'بلا انتهاء')}
        </Button>
      </div>
    </Modal>
  );
}
