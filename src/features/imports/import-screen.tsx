'use client';

/**
 * ImportsScreen — استيراد الرياضيين من Excel/CSV:
 * رفع → ربط الأعمدة → معاينة وتحقق → تأكيد → نتيجة + تنزيل ملف الأخطاء.
 *
 * العقود (من src/app/api/v1/imports/*):
 *  - GET  /imports (paginated) — ImportJob[]
 *  - POST /imports — multipart (file, entityType, mode)
 *  - GET/POST /imports/[id]/mapping — MappingInfo / { mapping: {field: colIndex} }
 *  - GET  /imports/[id]/preview?limit= — PreviewResult
 *  - POST /imports/[id]/confirm — ImportResultSummary
 *  - GET  /imports/[id]/errors — CSV ثنائي
 *  - GET  /imports/template?entityType=athlete — CSV ثنائي
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { apiRequest, apiUpload, downloadFile } from '@/shared/api/client';
import { useErrorText, useList } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Field } from '@/shared/ui-kit/form';
import { FileUpload } from '@/shared/ui-kit/file-upload';
import { Pagination } from '@/shared/ui-kit/pagination';
import { Select, type SelectOption } from '@/shared/ui-kit/select';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import { useToast } from '@/shared/ui-kit/toast';

interface ImportJobRow {
  id: string;
  entityType: string;
  fileName: string;
  status: string;
  mode: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  errorsFileKey: string | null;
  createdAt: string;
}

interface MappingInfo {
  jobId: string;
  status: string;
  entityType: string;
  headers: string[];
  sampleRows: string[][];
  fields: Array<{ name: string; label: string; required: boolean }>;
  suggestedMapping: Record<string, number>;
  currentMapping: Record<string, number> | null;
}

interface PreviewRow {
  rowIndex: number;
  raw: Record<string, string>;
  errors: Array<{ field: string; message: string }>;
  duplicate: boolean;
  duplicateReason: string | null;
}

interface PreviewResult {
  jobId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: PreviewRow[];
}

interface ImportResult {
  jobId: string;
  status: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  errorsFileKey: string | null;
  message: string;
}

type Step = 'upload' | 'mapping' | 'preview' | 'done';

const IGNORED = -1;

export function ImportsScreen() {
  const t = useTranslations('imports');
  const tCommon = useTranslations('common');
  const { can } = useSession();
  const toast = useToast();
  const fmt = useFormatters();
  const errText = useErrorText();

  const [step, setStep] = useState<Step>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState('skip_invalid');
  const [uploading, setUploading] = useState(false);

  const [mapping, setMapping] = useState<MappingInfo | null>(null);
  const [mappingForm, setMappingForm] = useState<Record<string, number>>({});
  const [savingMapping, setSavingMapping] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const jobs = useList<ImportJobRow>('/imports', { sort: '-createdAt' });
  const canImport = can('athletes.import');

  const modeOptions: SelectOption[] = useMemo(
    () => [
      { value: 'skip_invalid', label: tr(t, 'modeSkip', 'تخطي الصفوف غير الصالحة') },
      { value: 'abort_on_error', label: tr(t, 'modeAbort', 'إلغاء الاستيراد عند أي خطأ') },
    ],
    [t],
  );

  async function openJob(job: ImportJobRow) {
    setJobId(job.id);
    setResult(null);
    setPreview(null);
    if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
      setResult({
        jobId: job.id,
        status: job.status,
        totalRows: job.totalRows,
        successRows: job.successRows,
        failedRows: job.failedRows,
        errorsFileKey: job.errorsFileKey,
        message: `${tr(t, 'file', 'الملف')}: ${job.fileName}`,
      });
      setStep('done');
      return;
    }
    await loadMapping(job.id);
  }

  async function loadMapping(id: string) {
    setBusy(true);
    try {
      const res = await apiRequest<MappingInfo>(`/imports/${id}/mapping`);
      setMapping(res.data);
      const base: Record<string, number> = {};
      for (const f of res.data.fields) {
        base[f.name] = res.data.currentMapping?.[f.name] ?? res.data.suggestedMapping[f.name] ?? IGNORED;
      }
      setMappingForm(base);
      setStep('mapping');
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('entityType', 'athlete');
      form.set('mode', mode);
      const res = await apiUpload<ImportJobRow>('/imports', form);
      setJobId(res.data.id);
      setFile(null);
      jobs.reload();
      await loadMapping(res.data.id);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setUploading(false);
    }
  }

  async function saveMapping() {
    if (!jobId) return;
    const clean: Record<string, number> = {};
    for (const [field, col] of Object.entries(mappingForm)) {
      if (col >= 0) clean[field] = col;
    }
    const missing = (mapping?.fields ?? []).filter((f) => f.required && clean[f.name] === undefined);
    if (missing.length > 0) {
      toast.error(tr(t, 'requiredFieldsMissing', 'اربط الحقول الإلزامية: ') + missing.map((m) => m.label).join('، '));
      return;
    }
    setSavingMapping(true);
    try {
      await apiRequest(`/imports/${jobId}/mapping`, { method: 'POST', body: { mapping: clean } });
      await loadPreview();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setSavingMapping(false);
    }
  }

  async function loadPreview() {
    if (!jobId) return;
    setBusy(true);
    try {
      const res = await apiRequest<PreviewResult>(`/imports/${jobId}/preview`, { params: { limit: 200 } });
      setPreview(res.data);
      setStep('preview');
      jobs.reload();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!jobId) return;
    setBusy(true);
    try {
      const res = await apiRequest<ImportResult>(`/imports/${jobId}/confirm`, { method: 'POST', body: {} });
      setResult(res.data);
      setStep('done');
      toast.success(tr(t, 'importDone', 'تم تنفيذ الاستيراد'));
      jobs.reload();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('upload');
    setJobId(null);
    setMapping(null);
    setPreview(null);
    setResult(null);
    jobs.reload();
  }

  if (!canImport) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {tr(t, 'noPermission', 'لا تملك صلاحية استيراد الرياضيين')}
        </CardContent>
      </Card>
    );
  }

  const headerOptions: SelectOption[] = [
    { value: String(IGNORED), label: tr(t, 'ignoreColumn', 'تجاهل هذا الحقل') },
    ...(mapping
      ? mapping.headers.map((h, i) => ({
          value: String(i),
          label: `${i + 1}. ${h || tr(t, 'unnamedColumn', 'عمود بلا تسمية')}`,
        }))
      : []),
  ];

  const jobColumns: DataTableColumn<ImportJobRow>[] = [
    { header: tr(t, 'file', 'الملف'), cell: (j) => j.fileName },
    { header: tCommon('status'), cell: (j) => <StatusBadge value={j.status} /> },
    { header: tr(t, 'mode', 'الوضع'), cell: (j) => j.mode },
    { header: tr(t, 'totalRows', 'إجمالي الصفوف'), cell: (j) => fmt.number(j.totalRows) },
    { header: tr(t, 'successRows', 'ناجحة'), cell: (j) => fmt.number(j.successRows) },
    { header: tr(t, 'failedRows', 'فاشلة'), cell: (j) => fmt.number(j.failedRows) },
    { header: tr(t, 'createdAt', 'تاريخ الرفع'), cell: (j) => fmt.dateTime(j.createdAt), showInCard: false },
    {
      header: tCommon('actions'),
      align: 'end',
      cell: (j) => (
        <div className="flex items-center gap-2">
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => openJob(j)}>
            {tr(t, 'continue', 'متابعة')}
          </button>
          {j.errorsFileKey ? (
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => downloadFile(`/imports/${j.id}/errors`)}
            >
              {tCommon('download')}
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const previewColumns: DataTableColumn<PreviewRow>[] = [
    { header: tr(t, 'row', 'صف'), cell: (r) => r.rowIndex },
    {
      header: tr(t, 'rowName', 'الاسم'),
      cell: (r) => `${r.raw.firstName ?? ''} ${r.raw.lastName ?? ''}`.trim() || '—',
    },
    { header: tr(t, 'birthDate', 'تاريخ الميلاد'), cell: (r) => r.raw.birthDate || '—', showInCard: false },
    { header: tr(t, 'phone', 'الهاتف'), cell: (r) => r.raw.phone || '—', showInCard: false },
    {
      header: tCommon('status'),
      cell: (r) =>
        r.duplicate ? (
          <span className="text-sm text-warning">{r.duplicateReason ?? tr(t, 'duplicate', 'مكرر')}</span>
        ) : r.errors.length > 0 ? (
          <span className="text-sm text-destructive">
            {r.errors.map((e) => `${e.field}: ${e.message}`).join(' · ')}
          </span>
        ) : (
          <span className="text-sm text-success">{tr(t, 'valid', 'صالح')}</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={tr(t, 'title', 'استيراد الرياضيين')}
        subtitle={tr(t, 'subtitle', 'Excel (.xlsx) أو CSV — مع معاينة وربط أعمدة قبل الاعتماد')}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadFile('/imports/template', { entityType: 'athlete' }, 'athletes-template.csv')}
        >
          <Download className="size-4" aria-hidden />
          {tr(t, 'downloadTemplate', 'تنزيل القالب')}
        </Button>
        {step !== 'upload' ? (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            {tr(t, 'newImport', 'استيراد جديد')}
          </Button>
        ) : null}
      </div>

      {step === 'upload' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-4" aria-hidden />
              {tr(t, 'uploadStep', '1) رفع الملف')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileUpload
              file={file}
              onFileChange={setFile}
              accept=".xlsx,.csv"
              maxSizeMb={10}
              label={tr(t, 'chooseFile', 'اختر ملف Excel أو CSV')}
              uploading={uploading}
            />
            <Field label={tr(t, 'mode', 'الوضع')} className="max-w-sm">
              <Select options={modeOptions} value={mode} onChange={(e) => setMode(e.target.value)} />
            </Field>
            <Button type="button" onClick={upload} disabled={!file || uploading || busy}>
              <Upload className="size-4" aria-hidden />
              {uploading ? tCommon('uploading') : tr(t, 'startImport', 'بدء الاستيراد')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 'mapping' && mapping ? (
        <Card>
          <CardHeader>
            <CardTitle>{tr(t, 'mappingStep', '2) ربط الأعمدة')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {tr(t, 'job', 'عملية')}: {jobId} · {tr(t, 'columns', 'عدد الأعمدة')}: {mapping.headers.length}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {mapping.fields.map((f) => (
                <Field key={f.name} label={`${f.label}${f.required ? ' *' : ''}`}>
                  <Select
                    options={headerOptions}
                    value={String(mappingForm[f.name] ?? IGNORED)}
                    onChange={(e) => setMappingForm((prev) => ({ ...prev, [f.name]: Number(e.target.value) }))}
                  />
                </Field>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {mapping.headers.map((h, i) => (
                      <th key={i} className="border border-slate-200 bg-slate-50 px-2 py-1 text-start font-semibold">
                        {h || `#${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mapping.sampleRows.slice(0, 3).map((row, r) => (
                    <tr key={r}>
                      {mapping.headers.map((_, c) => (
                        <td key={c} className="border border-slate-200 px-2 py-1 whitespace-nowrap">
                          {row[c] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button type="button" onClick={saveMapping} disabled={savingMapping || busy}>
              {savingMapping ? tCommon('saving') : tr(t, 'saveMappingPreview', 'حفظ الربط ومعاينة الصفوف')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 'preview' && preview ? (
        <Card>
          <CardHeader>
            <CardTitle>{tr(t, 'previewStep', '3) المعاينة والتحقق')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                {tr(t, 'totalRows', 'إجمالي الصفوف')}: <b>{fmt.number(preview.totalRows)}</b>
              </span>
              <span className="text-success">
                {tr(t, 'validRows', 'صالحة')}: <b>{fmt.number(preview.validRows)}</b>
              </span>
              <span className="text-destructive">
                {tr(t, 'invalidRows', 'غير صالحة')}: <b>{fmt.number(preview.invalidRows)}</b>
              </span>
              <span className="text-warning">
                {tr(t, 'duplicateRows', 'مكررة')}: <b>{fmt.number(preview.duplicateRows)}</b>
              </span>
            </div>

            <DataTable
              columns={previewColumns}
              rows={preview.rows}
              getRowId={(r) => String(r.rowIndex)}
              emptyTitle={tr(t, 'noRows', 'لا توجد صفوف')}
            />

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={confirm} disabled={busy || preview.totalRows === 0}>
                {tr(t, 'confirmImport', 'تأكيد الاستيراد')}
              </Button>
              <Button type="button" variant="outline" onClick={() => jobId && loadMapping(jobId)} disabled={busy}>
                {tr(t, 'backToMapping', 'رجوع لربط الأعمدة')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {tr(t, 'confirmHint', 'يُستورد فقط الصفوف الصالحة وغير المكررة؛ وتُحفَظ المرفوضة في ملف أخطاء قابل للتنزيل.')}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {step === 'done' && result ? (
        <Card>
          <CardHeader>
            <CardTitle>{tr(t, 'resultStep', 'النتيجة')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                {tCommon('status')}: <b>{result.status}</b>
              </span>
              <span className="text-success">
                {tr(t, 'successRows', 'ناجحة')}: <b>{fmt.number(result.successRows)}</b>
              </span>
              <span className="text-destructive">
                {tr(t, 'failedRows', 'فاشلة')}: <b>{fmt.number(result.failedRows)}</b>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{result.message}</p>
            <div className="flex flex-wrap gap-2">
              {result.errorsFileKey ? (
                <Button type="button" variant="outline" onClick={() => downloadFile(`/imports/${result.jobId}/errors`)}>
                  <Download className="size-4" aria-hidden />
                  {tr(t, 'downloadErrors', 'تنزيل ملف الأخطاء')}
                </Button>
              ) : null}
              <Button type="button" onClick={reset}>
                {tr(t, 'newImport', 'استيراد جديد')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{tr(t, 'history', 'سجل عمليات الاستيراد')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <DataTable
            columns={jobColumns}
            rows={jobs.data ?? []}
            getRowId={(j) => j.id}
            loading={jobs.loading}
            error={jobs.error ? errText(jobs.error) : null}
            onRetry={jobs.reload}
            emptyTitle={tr(t, 'noJobs', 'لم تُنفَّذ عمليات استيراد بعد')}
          />
          <Pagination
            page={jobs.list.page}
            pageSize={jobs.list.pageSize}
            total={jobs.total}
            totalPages={jobs.totalPages}
            onPageChange={jobs.setPage}
            onPageSizeChange={jobs.setPageSize}
          />
        </CardContent>
      </Card>
    </div>
  );
}
