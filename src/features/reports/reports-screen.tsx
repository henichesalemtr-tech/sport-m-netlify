'use client';

/**
 * التقارير — اختيار نوع من 13 (المالية بوابة reports.view_finance)، مرشحات، إنشاء تقرير عام
 * من meta.columns + rows، ملخص، ترقيم يدوي، تصدير CSV/XLSX، وطباعة/حفظ PDF.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileSpreadsheet, Printer, Search, Table2 } from 'lucide-react';
import type {
  AgeCategoryDto,
  AthleteDto,
  CoachDto,
  ExportColumn,
  GroupDto,
  ReportRow,
  ReportTypeName,
  SportDto,
} from '@/shared/api/types';
import { ApiClientError, apiGet, downloadFile } from '@/shared/api/client';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Select } from '@/shared/ui-kit/select';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { Input } from '@/shared/ui-kit/input';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { Card } from '@/shared/ui-kit/card';
import { Badge } from '@/shared/ui-kit/status-badge';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { Loading } from '@/shared/ui-kit/loading';
import { useToast } from '@/shared/ui-kit/toast';

interface ReportMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  columns: ExportColumn[];
  reportType: ReportTypeName;
  summary?: Record<string, string | number | null>;
}

interface RunState {
  type: ReportTypeName;
  page: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  sportId?: string;
  groupId?: string;
  coachId?: string;
  ageCategoryId?: string;
  athleteId?: string;
}

const ALL_TYPES: ReportTypeName[] = [
  'athletes',
  'subscriptions',
  'payments',
  'debts',
  'attendance',
  'absence',
  'late',
  'coaches',
  'sports',
  'groups',
  'revenues',
  'expenses',
  'cash',
];

const FINANCE_TYPES: ReportTypeName[] = ['subscriptions', 'payments', 'debts', 'revenues', 'expenses', 'cash'];

const SUMMARY_LABELS: Record<string, string> = {
  totalDebt: 'إجمالي الديون',
  current: 'حالي (غير متأخر)',
  days0To30: 'متأخر 0–30 يومًا',
  days31To60: 'متأخر 31–60 يومًا',
  over60: 'متأخر أكثر من 60 يومًا',
  totalRevenue: 'إجمالي الإيرادات',
};

export function ReportsScreen() {
  const tc = useTranslations('common');
  const tRep = useTranslations('report');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can } = useSession();

  const canView = can('reports.view');
  const canFinance = can('reports.view_finance');
  const canExport = can('reports.export');

  const [selectedType, setSelectedType] = useState<ReportTypeName | null>(null);
  const [committed, setCommitted] = useState<RunState | null>(null);

  // حقول المرشحات (قبل التشغيل)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sportId, setSportId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [ageCategoryId, setAgeCategoryId] = useState('');
  const [athleteId, setAthleteId] = useState('');

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // تحميل خيارات المرشحات بشكل كسول فقط عند اختيار نوع
  const optionsEnabled = selectedType !== null;
  const sports = useApi<SportDto[]>('/sports', { params: { pageSize: 100 }, enabled: optionsEnabled });
  const groups = useApi<GroupDto[]>('/groups', { params: { pageSize: 100 }, enabled: optionsEnabled });
  const coaches = useApi<CoachDto[]>('/coaches', { params: { pageSize: 100 }, enabled: optionsEnabled });
  const ageCategories = useApi<AgeCategoryDto[]>('/age-categories', { params: { pageSize: 100 }, enabled: optionsEnabled });

  // بحث الرياضي
  const [athleteQuery, setAthleteQuery] = useState('');
  const [athleteResults, setAthleteResults] = useState<AthleteDto[]>([]);
  const [searching, setSearching] = useState(false);

  const searchAthletes = useCallback(
    async (q: string) => {
      setAthleteQuery(q);
      if (q.trim().length < 2) {
        setAthleteResults([]);
        return;
      }
      setSearching(true);
      try {
        const r = await apiGet<AthleteDto[]>('/athletes', { q, pageSize: 8 });
        setAthleteResults(r.data ?? []);
      } catch {
        setAthleteResults([]);
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  const buildParams = useCallback((run: RunState): Record<string, string | number | undefined> => {
    return {
      page: run.page,
      pageSize: run.pageSize,
      dateFrom: run.dateFrom || undefined,
      dateTo: run.dateTo || undefined,
      sportId: run.sportId || undefined,
      groupId: run.groupId || undefined,
      coachId: run.coachId || undefined,
      ageCategoryId: run.ageCategoryId || undefined,
      athleteId: run.athleteId || undefined,
    };
  }, []);

  useEffect(() => {
    if (!committed) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<ReportRow[]>(`/reports/${committed.type}`, buildParams(committed), { signal: controller.signal })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data ?? []);
        setMeta((res.meta as unknown as ReportMeta | undefined) ?? null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError(e instanceof ApiClientError ? errorText(e) : tc('errorGeneric'));
        setRows([]);
        setMeta(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed, buildParams]);

  const run = () => {
    if (!selectedType) return;
    setCommitted({
      type: selectedType,
      page: 1,
      pageSize: committed?.pageSize ?? 20,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sportId: sportId || undefined,
      groupId: groupId || undefined,
      coachId: coachId || undefined,
      ageCategoryId: ageCategoryId || undefined,
      athleteId: athleteId || undefined,
    });
  };

  const changePage = (page: number) => {
    setCommitted((prev) => (prev ? { ...prev, page } : prev));
  };
  const changePageSize = (pageSize: number) => {
    setCommitted((prev) => (prev ? { ...prev, pageSize, page: 1 } : prev));
  };

  const exportParams = useCallback(
    (run: RunState, format: 'csv' | 'xlsx'): Record<string, string | number | undefined> => ({
      format,
      dateFrom: run.dateFrom || undefined,
      dateTo: run.dateTo || undefined,
      sportId: run.sportId || undefined,
      groupId: run.groupId || undefined,
      coachId: run.coachId || undefined,
      ageCategoryId: run.ageCategoryId || undefined,
      athleteId: run.athleteId || undefined,
    }),
    [],
  );

  const doExport = useCallback(
    async (format: 'csv' | 'xlsx') => {
      if (!committed) return;
      try {
        const ext = format === 'xlsx' ? 'xlsx' : 'csv';
        await downloadFile(`reports/${committed.type}/export`, exportParams(committed, format), `report-${committed.type}.${ext}`);
        toast.success(tc('success'));
      } catch (e) {
        toast.error(e instanceof ApiClientError ? errorText(e) : tc('errorGeneric'));
      }
    },
    [committed, exportParams, toast, tc, errorText],
  );

  const dynamicColumns: DataTableColumn<ReportRow>[] = useMemo(() => {
    if (!meta) return [];
    return meta.columns.map((col) => ({
      header: col.label,
      cell: (row: ReportRow) => {
        const value = row[col.key];
        if (value === null || value === undefined || value === '') return '—';
        return <span className={typeof value === 'number' ? 'tabular-nums ltr-field' : undefined}>{String(value)}</span>;
      },
    }));
  }, [meta]);

  const summaryEntries = meta?.summary ? Object.entries(meta.summary) : [];

  const displayRows = useMemo<ReportRow[]>(() => rows.map((r, i) => ({ ...r, __rowId: i })), [rows]);

  if (!canView) {
    return (
      <div>
        <PageHeader title={tRep('title')} />
        <div className="card">
          <EmptyState title={tc('noData')} hint={tr(tRep, 'financeHint', 'ليس لديك صلاحية لعرض التقارير')} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={tRep('title')} subtitle={tr(tRep, 'results', 'النتائج')} />

      {/* اختيار نوع التقرير */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold">{tr(tRep, 'type', 'نوع التقرير')}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {ALL_TYPES.map((type) => {
            const finance = FINANCE_TYPES.includes(type);
            const blocked = finance && !canFinance;
            const active = selectedType === type;
            return (
              <button
                key={type}
                type="button"
                disabled={blocked}
                onClick={() => setSelectedType(type)}
                className={
                  'flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                  (blocked
                    ? 'cursor-not-allowed border-border bg-muted/40 text-muted-foreground opacity-60'
                    : active
                      ? 'border-primary bg-primary/10 font-medium text-foreground'
                      : 'border-border bg-card hover:bg-muted')
                }
                aria-pressed={active}
              >
                <span className="flex items-center gap-2">
                  <Table2 className="size-4 shrink-0 opacity-70" aria-hidden />
                  <span className="min-w-0 truncate">{tr(tRep, `types.${type}`, type)}</span>
                </span>
                {finance ? <Badge label={tr(tRep, 'financeBadge', 'مالي')} tone={blocked ? 'muted' : 'accent'} /> : null}
              </button>
            );
          })}
        </div>
        {FINANCE_TYPES.length > 0 && !canFinance ? (
          <p className="mt-3 text-xs text-muted-foreground">{tr(tRep, 'financeHint', 'التقارير المالية تتطلب صلاحية التقارير المالية')}</p>
        ) : null}
      </Card>

      {/* المرشحات */}
      {selectedType ? (
        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FieldWrap label={tr(tRep, 'dateFrom', 'من تاريخ')}>
              <DatePicker value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </FieldWrap>
            <FieldWrap label={tr(tRep, 'dateTo', 'إلى تاريخ')}>
              <DatePicker value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </FieldWrap>
            <FieldWrap label={tr(tRep, 'filter.sport', 'النشاط')}>
              <Select
                value={sportId}
                placeholder={tc('all')}
                options={(sports.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                onChange={(e) => setSportId(e.target.value)}
              />
            </FieldWrap>
            <FieldWrap label={tr(tRep, 'filter.group', 'المجموعة')}>
              <Select
                value={groupId}
                placeholder={tc('all')}
                options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
                onChange={(e) => setGroupId(e.target.value)}
              />
            </FieldWrap>
            <FieldWrap label={tr(tRep, 'filter.coach', 'المدرب')}>
              <Select
                value={coachId}
                placeholder={tc('all')}
                options={(coaches.data ?? []).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
                onChange={(e) => setCoachId(e.target.value)}
              />
            </FieldWrap>
            <FieldWrap label={tr(tRep, 'filter.ageCategory', 'الفئة العمرية')}>
              <Select
                value={ageCategoryId}
                placeholder={tc('all')}
                options={(ageCategories.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
                onChange={(e) => setAgeCategoryId(e.target.value)}
              />
            </FieldWrap>
            <FieldWrap label={tr(tRep, 'filter.athlete', 'الرياضي')} className="lg:col-span-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={athleteQuery}
                    onChange={(e) => void searchAthletes(e.target.value)}
                    placeholder={tc('searchPlaceholder')}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => void searchAthletes(athleteQuery)}>
                    <Search className="size-4" aria-hidden />
                  </Button>
                </div>
                {athleteId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAthleteId('')}>
                    {tc('clear')}
                  </Button>
                ) : null}
                {searching ? <Loading label={tc('loading')} /> : null}
                {athleteResults.length > 0 && !athleteId ? (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {athleteResults.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>
                          {a.firstName} {a.lastName}
                          <span className="ltr-field ms-2 font-mono text-xs text-muted-foreground">{a.registrationNo}</span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAthleteId(a.id);
                            setAthleteResults([]);
                          }}
                        >
                          {tc('add')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </FieldWrap>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button type="button" onClick={run} disabled={!selectedType}>
              {tr(tRep, 'run', 'إنشاء التقرير')}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* النتائج */}
      {committed ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {tr(tRep, `types.${committed.type}`, committed.type)} — {tr(tRep, 'results', 'النتائج')}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void doExport('csv')} disabled={!canExport}>
                <Download className="size-4" aria-hidden />
                {tr(tRep, 'exportCsv', 'تصدير CSV')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void doExport('xlsx')} disabled={!canExport}>
                <FileSpreadsheet className="size-4" aria-hidden />
                {tr(tRep, 'exportExcel', 'تصدير Excel')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden />
                {tr(tRep, 'printReport', 'طباعة/حفظ PDF')}
              </Button>
            </div>
          </div>

          {summaryEntries.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {summaryEntries.map(([key, value]) => (
                <div key={key} className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">{SUMMARY_LABELS[key] ?? key}</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums">
                    {typeof value === 'number' ? fmt.moneyDecimal(value) : value === null || value === undefined ? '—' : String(value)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="card p-0">
            <DataTable
              columns={dynamicColumns}
              rows={displayRows}
              getRowId={(r) => String(r['__rowId'] ?? '')}
              loading={loading}
              error={error}
              onRetry={() => setCommitted((prev) => (prev ? { ...prev } : prev))}
              emptyTitle={tr(tRep, 'noRows', 'لا توجد صفوف في هذا التقرير')}
            />
            <Pagination
              page={committed.page}
              totalPages={meta?.totalPages ?? 1}
              total={meta?.total ?? 0}
              pageSize={committed.pageSize}
              onPageChange={changePage}
              onPageSizeChange={changePageSize}
            />
          </div>
        </div>
      ) : (
        <div className="card">
          <EmptyState title={tr(tRep, 'run', 'إنشاء التقرير')} hint={tr(tRep, 'type', 'اختر نوع التقرير والمرشحات ثم أنشئ التقرير')} />
        </div>
      )}
    </div>
  );
}

function FieldWrap({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={'space-y-1.5 ' + (className ?? '')}>
      <label className="block text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}
