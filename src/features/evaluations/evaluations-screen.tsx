'use client';

/**
 * EvaluationsScreen — تبويبات: التقييمات (قائمة + إنشاء)، القوالب (CRUD)،
 * منحنى التقدم (time-series)، مقارنة مجموعة (group/{id}).
 *
 * عقود (تمت قراءتها من src/app/api/v1/evaluations/*):
 *  - GET /evaluations (paginated) — filters athleteId,coachId,templateId,dateFrom,dateTo
 *  - POST /evaluations — {athleteId,templateId,coachId?,evaluationDate,scores,notes?} (evaluations.create)
 *  - PATCH /evaluations/[id] — partial (evaluations.edit)
 *  - DELETE /evaluations/[id] — soft delete (evaluations.edit)
 *  - GET /evaluations/time-series?athleteId=&templateId= → {data:EvaluationTimeSeries}
 *  - GET /evaluations/group/{groupId} → {data:GroupComparisonResult}
 * ملاحظة: عنصر قائمة التقييم يصل مُسطَّحًا (athleteName/templateName/coachName/scores/total/average).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { ApiClientError, apiDelete, apiPatch, apiPost, newIdempotencyKey } from '@/shared/api/client';
import type { CoachDto, GroupDto } from '@/shared/api/types';
import { useApi, useErrorText, useList } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { todayFor } from '@/shared/lib/format';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Textarea } from '@/shared/ui-kit/textarea';
import { Select, type SelectOption } from '@/shared/ui-kit/select';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { Field, ErrorText, FormGrid } from '@/shared/ui-kit/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui-kit/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { Chart, type ChartDatum } from '@/shared/ui-kit/chart';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { Loading } from '@/shared/ui-kit/loading';
import { useToast } from '@/shared/ui-kit/toast';
import { AthletePicker, type AthleteSelection } from '@/features/evaluations/athlete-picker';
import { TemplatesScreen } from '@/features/evaluations/templates-screen';

interface Criterion {
  key: string;
  label: string;
  min: number;
  max: number;
}

interface EvaluationRow {
  id: string;
  athleteId: string;
  athleteName: string;
  registrationNo: string;
  templateId: string;
  templateName: string;
  coachId: string;
  coachName: string;
  evaluationDate: string;
  scores: unknown;
  total: number;
  average: number;
  notes: string | null;
  createdAt: string;
}

interface TemplateOption {
  id: string;
  name: string;
  criteria: unknown;
}

interface TimeSeriesPoint {
  evaluationId: string;
  date: string;
  templateId: string;
  templateName: string;
  scores: Record<string, number>;
  total: number;
  average: number;
  coachName: string;
}

interface EvaluationTimeSeries {
  athleteId: string;
  points: TimeSeriesPoint[];
}

interface AthleteTemplateScores {
  evaluationDate: string;
  scores: Record<string, number>;
  total: number;
}

interface TemplateComparison {
  templateId: string;
  templateName: string;
  evaluatedCount: number;
  criteria: Array<{
    key: string;
    label: string;
    min: number;
    max: number;
    average: number | null;
    lowest: number | null;
    highest: number | null;
  }>;
}

interface GroupComparisonResult {
  group: { id: string; name: string; code: string };
  totalAthletes: number;
  templates: TemplateComparison[];
  athletes: Array<{
    athleteId: string;
    registrationNo: string;
    name: string;
    evaluations: Record<string, AthleteTemplateScores>;
  }>;
}

function parseCriteria(raw: unknown): Criterion[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: Criterion[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.key === 'string' &&
      typeof rec.label === 'string' &&
      typeof rec.min === 'number' &&
      typeof rec.max === 'number'
    ) {
      out.push({ key: rec.key, label: rec.label, min: rec.min, max: rec.max });
    }
  }
  return out;
}

function parseScores(raw: unknown): Record<string, number> {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function scoresSummary(raw: unknown): string {
  const entries = Object.entries(parseScores(raw));
  if (entries.length === 0) return '—';
  return entries.map(([k, v]) => `${k}: ${v}`).join(' · ');
}

export function EvaluationsScreen() {
  const t = useTranslations('evaluation');
  const { can, canAny } = useSession();

  const canView = can('evaluations.view');
  const showList = canView;
  const showTemplates = can('evaluations.view');
  const showProgress = canView;
  const showGroup = canView;

  if (!canAny(['evaluations.view', 'evaluations.create', 'evaluations.edit', 'sports.manage'])) {
    return (
      <div>
        <PageHeader title={tr(t, 'titlePlural', 'التقييمات')} />
        <EmptyState title={tr(t, 'noAccess', 'لا توجد صلاحية للاطلاع على التقييمات')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={tr(t, 'titlePlural', 'التقييمات')} />
      <Tabs defaultValue={showList ? 'list' : showTemplates ? 'templates' : showProgress ? 'progress' : 'group'}>
        <TabsList className="mb-4">
          {showList ? <TabsTrigger value="list">{tr(t, 'titlePlural', 'التقييمات')}</TabsTrigger> : null}
          {showTemplates ? <TabsTrigger value="templates">{tr(t, 'templates', 'قوالب التقييم')}</TabsTrigger> : null}
          {showProgress ? <TabsTrigger value="progress">{tr(t, 'timeSeries', 'منحنى التقدم')}</TabsTrigger> : null}
          {showGroup ? <TabsTrigger value="group">{tr(t, 'groupComparison', 'مقارنة مجموعة')}</TabsTrigger> : null}
        </TabsList>
        {showList ? (
          <TabsContent value="list">
            <EvaluationsList />
          </TabsContent>
        ) : null}
        {showTemplates ? (
          <TabsContent value="templates">
            <TemplatesScreen />
          </TabsContent>
        ) : null}
        {showProgress ? (
          <TabsContent value="progress">
            <ProgressPanel />
          </TabsContent>
        ) : null}
        {showGroup ? (
          <TabsContent value="group">
            <GroupComparisonPanel />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

// ---------- قائمة التقييمات + نافذة الإنشاء ----------

function EvaluationsList() {
  const t = useTranslations('evaluation');
  const tc = useTranslations('common');
  const tToast = useTranslations('ui.toast');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can, settings } = useSession();

  const canCreate = can('evaluations.create');
  const canEdit = can('evaluations.edit');
  const canViewCoaches = can('coaches.view');

  const list = useList<EvaluationRow>('/evaluations', { sort: '-evaluationDate' });
  const templates = useApi<TemplateOption[]>('/evaluation-templates', {
    params: { pageSize: 100, isActive: 'true' },
    enabled: can('evaluations.view'),
  });
  const coaches = useApi<CoachDto[]>('/coaches', {
    params: { pageSize: 100 },
    enabled: canViewCoaches,
  });

  const [athlete, setAthlete] = useState<AthleteSelection | null>(null);
  const [filters, setFilters] = useState<{ coachId?: string; templateId?: string; dateFrom?: string; dateTo?: string }>({});

  const templateOptions: SelectOption[] = useMemo(
    () => (templates.data ?? []).map((x) => ({ value: x.id, label: x.name })),
    [templates.data],
  );
  const coachOptions: SelectOption[] = useMemo(
    () => (coaches.data ?? []).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })),
    [coaches.data],
  );

  const applyFilters = (nextAthlete: AthleteSelection | null, next: typeof filters) => {
    list.setFilters({
      athleteId: nextAthlete?.id || undefined,
      coachId: next.coachId || undefined,
      templateId: next.templateId || undefined,
      dateFrom: next.dateFrom || undefined,
      dateTo: next.dateTo || undefined,
    });
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<EvaluationRow | null>(null);
  const [deleting, setDeleting] = useState<EvaluationRow | null>(null);

  const columns: DataTableColumn<EvaluationRow>[] = [
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
    {
      header: tr(t, 'template', 'القالب'),
      cell: (r) => r.templateName,
      showInCard: true,
    },
    { key: 'evaluationDate', header: tr(t, 'evaluationDate', 'تاريخ التقييم'), cell: (r) => fmt.date(r.evaluationDate), showInCard: true },
    { header: tr(t, 'coach', 'المدرب'), cell: (r) => r.coachName || '—', showInCard: false },
    { header: tr(t, 'scores', 'الدرجات'), cell: (r) => <span className="text-xs">{scoresSummary(r.scores)}</span>, showInCard: false },
    { header: tc('total'), cell: (r) => <span className="tabular-nums">{fmt.number(r.total)}</span>, align: 'end', showInCard: true },
    { header: tr(t, 'average', 'المتوسط'), cell: (r) => <span className="tabular-nums">{fmt.number(r.average)}</span>, align: 'end', showInCard: true },
  ];

  if (canEdit) {
    columns.push({
      header: tc('actions'),
      align: 'end',
      showInCard: true,
      cell: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditRow(r)}>
            {tc('edit')}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(r)}>
            {tc('delete')}
          </Button>
        </div>
      ),
    });
  }

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/evaluations/${deleting.id}`);
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canCreate ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {tr(t, 'newEvaluation', 'تقييم جديد')}
          </Button>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        <div className="w-44">
          <Select
            aria-label={tr(t, 'template', 'القالب')}
            value={filters.templateId ?? ''}
            placeholder={`${tc('all')} — ${tr(t, 'template', 'القالب')}`}
            options={templateOptions}
            onChange={(e) => {
              const next = { ...filters, templateId: e.target.value };
              setFilters(next);
              applyFilters(athlete, next);
            }}
          />
        </div>
        <div className="w-44">
          <Select
            aria-label={tr(t, 'coach', 'المدرب')}
            value={filters.coachId ?? ''}
            placeholder={`${tc('all')} — ${tr(t, 'coach', 'المدرب')}`}
            options={coachOptions}
            onChange={(e) => {
              const next = { ...filters, coachId: e.target.value };
              setFilters(next);
              applyFilters(athlete, next);
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
              applyFilters(athlete, next);
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

      {canCreate ? (
        <EvaluationFormModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="create"
          templateOptions={templateOptions}
          coachOptions={coachOptions}
          showCoachSelect={canViewCoaches}
          defaultDate={todayFor(settings)}
          onSaved={list.reload}
        />
      ) : null}

      {editRow ? (
        <EvaluationFormModal
          open
          onOpenChange={(o) => {
            if (!o) setEditRow(null);
          }}
          mode="edit"
          row={editRow}
          templateOptions={templateOptions}
          coachOptions={coachOptions}
          showCoachSelect={canViewCoaches}
          defaultDate={editRow.evaluationDate}
          onSaved={list.reload}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={tc('delete')}
        message={deleting ? `${deleting.athleteName} — ${deleting.templateName}` : ''}
        confirmLabel={tc('delete')}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

interface EvaluationFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  row?: EvaluationRow | null;
  templateOptions: SelectOption[];
  coachOptions: SelectOption[];
  showCoachSelect: boolean;
  defaultDate: string;
  onSaved: () => void;
}

function EvaluationFormModal({
  open,
  onOpenChange,
  mode,
  row,
  templateOptions,
  coachOptions,
  showCoachSelect,
  defaultDate,
  onSaved,
}: EvaluationFormModalProps) {
  const t = useTranslations('evaluation');
  const tc = useTranslations('common');
  const tToast = useTranslations('ui.toast');
  const tv = useTranslations('ui.validation');
  const errorText = useErrorText();
  const toast = useToast();
  const { can } = useSession();

  const [athlete, setAthlete] = useState<AthleteSelection | null>(
    row ? { id: row.athleteId, name: row.athleteName, registrationNo: row.registrationNo } : null,
  );
  const [templateId, setTemplateId] = useState(row?.templateId ?? '');
  const [coachId, setCoachId] = useState(row?.coachId ?? '');
  const [date, setDate] = useState(row?.evaluationDate ?? defaultDate);
  const [notes, setNotes] = useState(row?.notes ?? '');
  const initialScores: Record<string, string> = {};
  if (row) {
    for (const [k, v] of Object.entries(parseScores(row.scores))) initialScores[k] = String(v);
  }
  const [scores, setScores] = useState<Record<string, string>>(initialScores);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // معايير القالب المختار — تُحمّل من تفاصيل القالب (GET /evaluation-templates/[id])
  const tplDetail = useApi<TemplateOption>(templateId ? `/evaluation-templates/${templateId}` : null, {
    enabled: Boolean(templateId),
  });
  const criteria = useMemo<Criterion[]>(
    () => (tplDetail.data ? parseCriteria(tplDetail.data.criteria) : []),
    [tplDetail.data],
  );

  const setScore = (key: string, value: string) => {
    setScores((prev) => ({ ...prev, [key]: value.replace(/[^\d.\-]/g, '') }));
  };

  const submit = async () => {
    setFormError(null);
    if (mode === 'create' && !athlete) {
      setFormError(`${tr(t, 'athlete', 'الرياضي')}: ${tv('required')}`);
      return;
    }
    if (!templateId) {
      setFormError(`${tr(t, 'template', 'القالب')}: ${tv('required')}`);
      return;
    }
    if (!date) {
      setFormError(`${tr(t, 'evaluationDate', 'تاريخ التقييم')}: ${tv('required')}`);
      return;
    }
    if (criteria.length === 0) {
      setFormError(`${tr(t, 'criteria', 'المعايير')}: ${tv('required')}`);
      return;
    }
    const numeric: Record<string, number> = {};
    for (const c of criteria) {
      const raw = scores[c.key] ?? '';
      if (raw.trim() === '') {
        setFormError(`${c.label}: ${tv('required')}`);
        return;
      }
      const val = Number(raw);
      if (!Number.isFinite(val)) {
        setFormError(`${c.label}: ${tv('number')}`);
        return;
      }
      if (val < c.min || val > c.max) {
        setFormError(`${c.label}: ${c.min}–${c.max}`);
        return;
      }
      numeric[c.key] = val;
    }

    const trimmedNotes = notes.trim();
    setBusy(true);
    try {
      if (mode === 'create') {
        await apiPost(
          '/evaluations',
          {
            athleteId: athlete?.id,
            templateId,
            ...(coachId ? { coachId } : {}),
            evaluationDate: date,
            scores: numeric,
            ...(trimmedNotes ? { notes: trimmedNotes } : {}),
          },
          { idempotencyKey: newIdempotencyKey() },
        );
        toast.success(tToast('created'));
      } else if (row) {
        await apiPatch(`/evaluations/${row.id}`, {
          templateId,
          ...(coachId ? { coachId } : {}),
          evaluationDate: date,
          scores: numeric,
          notes: trimmedNotes,
        });
        toast.success(tToast('updated'));
      }
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
      title={mode === 'create' ? tr(t, 'newEvaluation', 'تقييم جديد') : tr(t, 'editEvaluation', 'تعديل التقييم')}
      size="lg"
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

      {mode === 'create' ? (
        <div className="mb-4">
          <AthletePicker
            label={tr(t, 'athlete', 'الرياضي')}
            value={athlete}
            enabled={can('athletes.view')}
            onChange={setAthlete}
          />
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          {row?.athleteName}{' '}
          <span className="ltr-field font-mono text-xs text-muted-foreground">{row?.registrationNo}</span>
        </div>
      )}

      <FormGrid>
        <Field label={tr(t, 'template', 'القالب')} htmlFor="ev-template" required>
          <Select
            id="ev-template"
            value={templateId}
            placeholder={tc('none')}
            options={templateOptions}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setScores({});
            }}
          />
        </Field>
        {showCoachSelect ? (
          <Field label={tr(t, 'coach', 'المدرب')} htmlFor="ev-coach" optional>
            <Select
              id="ev-coach"
              value={coachId}
              placeholder={tc('none')}
              options={coachOptions}
              onChange={(e) => setCoachId(e.target.value)}
            />
          </Field>
        ) : null}
        <Field label={tr(t, 'evaluationDate', 'تاريخ التقييم')} htmlFor="ev-date" required>
          <DatePicker id="ev-date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </FormGrid>

      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">{tr(t, 'scores', 'الدرجات')}</h3>
        {!templateId ? (
          <p className="text-sm text-muted-foreground">{tr(t, 'selectTemplateFirst', 'اختر القالب لعرض المعايير')}</p>
        ) : tplDetail.loading ? (
          <Loading label={tc('loading')} />
        ) : criteria.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr(t, 'criteria', 'المعايير')}: {tc('noData')}</p>
        ) : (
          <FormGrid>
            {criteria.map((c) => (
              <Field key={c.key} label={`${c.label} (${c.min}–${c.max})`} htmlFor={`sc-${c.key}`} required>
                <Input
                  id={`sc-${c.key}`}
                  inputMode="numeric"
                  ltr
                  value={scores[c.key] ?? ''}
                  onChange={(e) => setScore(c.key, e.target.value)}
                />
              </Field>
            ))}
          </FormGrid>
        )}
      </div>

      <div className="mt-4">
        <Field label={tc('notes')} htmlFor="ev-notes" optional>
          <Textarea id="ev-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------- منحنى التقدم ----------

function ProgressPanel() {
  const t = useTranslations('evaluation');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const fmt = useFormatters();
  const { can } = useSession();

  const [athlete, setAthlete] = useState<AthleteSelection | null>(null);
  const [templateId, setTemplateId] = useState('');

  const templates = useApi<TemplateOption[]>('/evaluation-templates', {
    params: { pageSize: 100 },
    enabled: can('evaluations.view'),
  });
  const templateOptions: SelectOption[] = useMemo(
    () => (templates.data ?? []).map((x) => ({ value: x.id, label: x.name })),
    [templates.data],
  );

  const series = useApi<EvaluationTimeSeries>('/evaluations/time-series', {
    params: { athleteId: athlete?.id, templateId: templateId || undefined },
    enabled: Boolean(athlete),
  });

  const chartData: ChartDatum[] = useMemo(
    () => (series.data?.points ?? []).map((p) => ({ name: p.date, value: p.average })),
    [series.data],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr(t, 'timeSeries', 'منحنى التقدم')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64">
            <AthletePicker
              label={tr(t, 'athlete', 'الرياضي')}
              value={athlete}
              enabled={can('athletes.view')}
              onChange={setAthlete}
            />
          </div>
          <div className="w-48">
            <Field label={tr(t, 'template', 'القالب')} htmlFor="ts-template" optional>
              <Select
                id="ts-template"
                value={templateId}
                placeholder={tc('all')}
                options={templateOptions}
                onChange={(e) => setTemplateId(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {!athlete ? (
          <p className="text-sm text-muted-foreground">{tr(t, 'selectAthleteFirst', 'اختر الرياضي أولًا لعرض منحنى التقدم')}</p>
        ) : series.error ? (
          <ErrorState message={errorText(series.error)} onRetry={series.reload} />
        ) : (
          <Chart
            kind="line"
            data={chartData}
            loading={series.loading}
            seriesLabel={tr(t, 'average', 'المتوسط')}
            valueFormatter={(v) => fmt.number(v)}
          />
        )}

        {athlete && !series.loading && (series.data?.points.length ?? 0) > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-start">
                  <th scope="col" className="px-3 py-2 text-start font-semibold">{tr(t, 'evaluationDate', 'التاريخ')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-semibold">{tr(t, 'template', 'القالب')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-semibold">{tc('total')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-semibold">{tr(t, 'average', 'المتوسط')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-semibold">{tr(t, 'coach', 'المدرب')}</th>
                </tr>
              </thead>
              <tbody>
                {(series.data?.points ?? []).map((p) => (
                  <tr key={p.evaluationId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 ltr-field">{p.date}</td>
                    <td className="px-3 py-2">{p.templateName}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{fmt.number(p.total)}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{fmt.number(p.average)}</td>
                    <td className="px-3 py-2">{p.coachName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------- مقارنة مجموعة ----------

function GroupComparisonPanel() {
  const t = useTranslations('evaluation');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const fmt = useFormatters();
  const { can } = useSession();

  const [groupId, setGroupId] = useState('');

  const groups = useApi<GroupDto[]>('/groups', {
    params: { pageSize: 100, sort: 'name' },
    enabled: can('groups.view'),
  });
  const groupOptions: SelectOption[] = useMemo(
    () => (groups.data ?? []).map((g) => ({ value: g.id, label: `${g.name} (${g.code})` })),
    [groups.data],
  );

  const comparison = useApi<GroupComparisonResult>(groupId ? `/evaluations/group/${groupId}` : null, {
    enabled: Boolean(groupId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr(t, 'groupComparison', 'مقارنة مجموعة')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-72">
          <Field label={tr(t, 'group', 'المجموعة')} htmlFor="gc-group">
            <Select
              id="gc-group"
              value={groupId}
              placeholder={tc('none')}
              options={groupOptions}
              onChange={(e) => setGroupId(e.target.value)}
            />
          </Field>
        </div>

        {!groupId ? (
          <p className="text-sm text-muted-foreground">{tr(t, 'selectGroupFirst', 'اختر المجموعة لعرض المقارنة')}</p>
        ) : comparison.loading ? (
          <Loading label={tc('loading')} />
        ) : comparison.error ? (
          <ErrorState message={errorText(comparison.error)} onRetry={comparison.reload} />
        ) : !comparison.data ? (
          <EmptyState title={tc('noData')} />
        ) : (
          <GroupComparisonTable result={comparison.data} number={(v) => fmt.number(v)} />
        )}
      </CardContent>
    </Card>
  );
}

function GroupComparisonTable({ result, number }: { result: GroupComparisonResult; number: (v: number) => string }) {
  const t = useTranslations('evaluation');
  const tc = useTranslations('common');

  if (result.athletes.length === 0 || result.templates.length === 0) {
    return <EmptyState title={tc('noData')} hint={result.group.name} />;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {result.group.name} <span className="ltr-field font-mono">({result.group.code})</span> —{' '}
        {tc('total')}: {number(result.totalAthletes)}
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th scope="col" className="sticky start-0 px-3 py-2 text-start font-semibold">{tr(t, 'athlete', 'الرياضي')}</th>
              {result.templates.map((tpl) => (
                <th key={tpl.templateId} scope="col" className="px-3 py-2 text-end font-semibold whitespace-nowrap">
                  {tpl.templateName}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {tr(t, 'evaluatedCount', 'المُقيَّمون')}: {number(tpl.evaluatedCount)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.athletes.map((a) => (
              <tr key={a.athleteId} className="border-b border-border last:border-0">
                <th scope="row" className="sticky start-0 px-3 py-2 text-start font-normal">
                  <span className="block">{a.name}</span>
                  <span className="ltr-field block font-mono text-xs text-muted-foreground">{a.registrationNo}</span>
                </th>
                {result.templates.map((tpl) => {
                  const cell = a.evaluations[tpl.templateId];
                  return (
                    <td key={tpl.templateId} className="px-3 py-2 text-end tabular-nums">
                      {cell ? number(cell.total) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
