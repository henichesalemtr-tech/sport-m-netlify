'use client';

/**
 * TemplatesScreen — CRUD قوالب التقييم مع محرر معايير ديناميكي.
 * العقود (تمت قراءتها من src/app/api/v1/evaluation-templates/*):
 *  - GET /evaluation-templates (paginated) — filters: sportId?, isActive('true'|'false')?, q?
 *  - POST /evaluation-templates — body createEvaluationTemplateSchema
 *    {name(2..100), sportId?(uuid|null), criteria:[{key,label,min,max}], isActive?} (server: sports.manage)
 *  - PATCH /evaluation-templates/[id] — partial (server: sports.manage)
 *  - DELETE /evaluation-templates/[id] — soft delete (server: sports.manage)
 * ملاحظة: `criteria` يعود من الخادم كنص JSON (يُحلَّل بأمان).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { ApiClientError, apiDelete, apiPatch, apiPost } from '@/shared/api/client';
import type { SportDto } from '@/shared/api/types';
import { useApi, useErrorText, useList } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { tr } from '@/features/common/tr';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { SearchInput } from '@/shared/ui-kit/search';
import { Select, type SelectOption } from '@/shared/ui-kit/select';
import { Checkbox } from '@/shared/ui-kit/date-picker';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { Field, ErrorText, FormGrid } from '@/shared/ui-kit/form';
import { useToast } from '@/shared/ui-kit/toast';
import { useFormatters } from '@/features/common/use-formatters';
import { cn } from '@/shared/ui-kit/utils';

interface Criterion {
  key: string;
  label: string;
  min: number;
  max: number;
}

interface TemplateRow {
  id: string;
  name: string;
  sportId: string | null;
  criteria: unknown; // نص JSON من Prisma
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DraftCriterion {
  key: string;
  label: string;
  min: string;
  max: string;
}

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/;

/** حلّ معايير القالب (نص JSON) بأمان دون أي. */
function parseCriteria(raw: unknown): Criterion[] {
  if (Array.isArray(raw)) return normalizeCriteria(raw);
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeCriteria(parsed);
    } catch {
      /* ignore */
    }
  }
  return [];
}

function normalizeCriteria(list: unknown[]): Criterion[] {
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

function criteriaSummary(raw: unknown): string {
  const list = parseCriteria(raw);
  if (list.length === 0) return '—';
  return list.map((c) => `${c.label} (${c.min}–${c.max})`).join('، ');
}

const emptyCriterion = (): DraftCriterion => ({ key: '', label: '', min: '1', max: '5' });

export function TemplatesScreen() {
  const t = useTranslations('evaluation');
  const tc = useTranslations('common');
  const tToast = useTranslations('ui.toast');
  const tv = useTranslations('ui.validation');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can } = useSession();

  const canManage = can('sports.manage');
  const canViewSports = can('sports.view');

  const list = useList<TemplateRow>('/evaluation-templates', { sort: '-createdAt' });
  const sports = useApi<SportDto[]>('/sports', {
    params: { pageSize: 100, sort: 'sortOrder' },
    enabled: canViewSports,
  });

  const [filters, setFilters] = useState<{ sportId?: string; isActive?: string }>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [deleting, setDeleting] = useState<TemplateRow | null>(null);

  const [name, setName] = useState('');
  const [sportId, setSportId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [criteria, setCriteria] = useState<DraftCriterion[]>([emptyCriterion()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sportOptions: SelectOption[] = useMemo(
    () => (sports.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [sports.data],
  );
  const sportNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sports.data ?? []) map.set(s.id, s.name);
    return map;
  }, [sports.data]);

  const applyFilters = (next: typeof filters) => {
    list.setFilters({
      sportId: next.sportId || undefined,
      isActive: next.isActive || undefined,
    });
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSportId('');
    setIsActive(true);
    setCriteria([emptyCriterion()]);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: TemplateRow) => {
    setEditing(row);
    setName(row.name);
    setSportId(row.sportId ?? '');
    setIsActive(row.isActive);
    setCriteria(
      parseCriteria(row.criteria).map((c) => ({
        key: c.key,
        label: c.label,
        min: String(c.min),
        max: String(c.max),
      })),
    );
    setFormError(null);
    setModalOpen(true);
  };

  const updateCriterion = (index: number, patch: Partial<DraftCriterion>) => {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const addCriterion = () => {
    setCriteria((prev) => (prev.length >= 30 ? prev : [...prev, emptyCriterion()]));
  };

  const removeCriterion = (index: number) => {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  const buildPayload = (): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return { ok: false, message: tr(t, 'templateName', 'اسم القالب') + ' — ' + tv('minLength', { min: 2 }) };
    }
    if (criteria.length === 0) {
      return { ok: false, message: tr(t, 'criteria', 'المعايير') + ': ' + tv('required') };
    }
    const parsed: Criterion[] = [];
    const keys = new Set<string>();
    for (let i = 0; i < criteria.length; i += 1) {
      const c = criteria[i];
      if (!c) continue;
      const key = c.key.trim();
      const label = c.label.trim();
      if (!KEY_RE.test(key)) {
        return { ok: false, message: `${tr(t, 'criterionKey', 'مفتاح المعيار')} [${i + 1}]: لاتيني بلا مسافات` };
      }
      if (label.length < 1 || label.length > 80) {
        return { ok: false, message: `${tr(t, 'criterionLabel', 'اسم المعيار')} [${i + 1}]` + ': ' + tv('required') };
      }
      if (keys.has(key)) {
        return { ok: false, message: `${tr(t, 'criterionKey', 'مفتاح المعيار')} مكرر: ${key}` };
      }
      keys.add(key);
      const min = Number.parseInt(c.min, 10);
      const max = Number.parseInt(c.max, 10);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return { ok: false, message: `${label}: ${tv('number')}` };
      }
      if (!(max > min)) {
        return { ok: false, message: `${label}: ${tr(t, 'max', 'الحد الأقصى')} > ${tr(t, 'min', 'الحد الأدنى')}` };
      }
      parsed.push({ key, label, min, max });
    }
    const body: Record<string, unknown> = {
      name: trimmedName,
      criteria: parsed,
      isActive,
    };
    if (sportId) body.sportId = sportId;
    else if (editing) body.sportId = null;
    return { ok: true, body };
  };

  const submit = async () => {
    const built = buildPayload();
    if (!built.ok) {
      setFormError(built.message);
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      if (editing) {
        await apiPatch(`/evaluation-templates/${editing.id}`, built.body);
        toast.success(tToast('updated'));
      } else {
        await apiPost('/evaluation-templates', built.body);
        toast.success(tToast('created'));
      }
      setModalOpen(false);
      list.reload();
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

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/evaluation-templates/${deleting.id}`);
      toast.success(tToast('deleted'));
      list.reload();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setDeleting(null);
    }
  };

  const columns: DataTableColumn<TemplateRow>[] = [
    {
      key: 'name',
      header: tr(t, 'templateName', 'اسم القالب'),
      cell: (r) => <span className="font-medium">{r.name}</span>,
      showInCard: true,
    },
    {
      header: tr(t, 'sport', 'النشاط'),
      cell: (r) => (r.sportId ? sportNameById.get(r.sportId) ?? '—' : tc('all')),
      showInCard: true,
    },
    {
      header: tr(t, 'criteria', 'المعايير'),
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{criteriaSummary(r.criteria)}</span>
      ),
      showInCard: false,
    },
    {
      key: 'isActive',
      header: tc('status'),
      cell: (r) => <StatusBadge value={r.isActive ? 'ACTIVE' : 'INACTIVE'} />,
      showInCard: true,
    },
    {
      key: 'createdAt',
      header: tc('createdAt'),
      cell: (r) => fmt.date(r.createdAt),
      showInCard: false,
    },
  ];

  if (canManage) {
    columns.push({
      header: tc('actions'),
      align: 'end',
      showInCard: true,
      cell: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
          <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(r)}>
            {tc('edit')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setDeleting(r)}
          >
            {tc('delete')}
          </Button>
        </div>
      ),
    });
  }

  return (
    <div>
      <PageHeader
        title={tr(t, 'templates', 'قوالب التقييم')}
        actions={
          canManage ? (
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" aria-hidden />
              {tr(t, 'newTemplate', 'قالب جديد')}
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-52 flex-1">
          <SearchInput value={list.list.q} onSearch={list.setQ} placeholder={tr(t, 'templateName', 'اسم القالب') + '…'} />
        </div>
        <div className="w-44">
          <Select
            aria-label={tr(t, 'sport', 'النشاط')}
            value={filters.sportId ?? ''}
            placeholder={`${tc('all')} — ${tr(t, 'sport', 'النشاط')}`}
            options={sportOptions}
            onChange={(e) => {
              const next = { ...filters, sportId: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
        <div className="w-40">
          <Select
            aria-label={tc('status')}
            value={filters.isActive ?? ''}
            placeholder={`${tc('all')} — ${tc('status')}`}
            options={[
              { value: 'true', label: tc('active') },
              { value: 'false', label: tc('inactive') },
            ]}
            onChange={(e) => {
              const next = { ...filters, isActive: e.target.value };
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

      <Modal
        open={modalOpen}
        onOpenChange={(o) => {
          if (!busy) setModalOpen(o);
        }}
        title={editing ? tr(t, 'editTemplate', 'تعديل القالب') : tr(t, 'newTemplate', 'قالب جديد')}
        size="xl"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={busy}>
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
        <FormGrid>
          <Field label={tr(t, 'templateName', 'اسم القالب')} htmlFor="tpl-name" required>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </Field>
          <Field label={tr(t, 'sport', 'النشاط')} htmlFor="tpl-sport" optional>
            <Select
              id="tpl-sport"
              value={sportId}
              placeholder={tc('none')}
              options={sportOptions}
              onChange={(e) => setSportId(e.target.value)}
            />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{tr(t, 'criteria', 'المعايير')}</h3>
            {canManage ? (
              <Button type="button" size="sm" variant="outline" onClick={addCriterion}>
                <Plus className="size-4" aria-hidden />
                {tr(t, 'addCriterion', 'إضافة معيار')}
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            {criteria.map((c, i) => (
              <div key={i} className={cn('flex flex-wrap items-end gap-2 rounded-lg border border-border p-2')}>
                <Field label={tr(t, 'criterionKey', 'مفتاح المعيار')} htmlFor={`c-key-${i}`} required className="min-w-36 flex-1">
                  <Input
                    id={`c-key-${i}`}
                    ltr
                    value={c.key}
                    maxLength={31}
                    placeholder="speed"
                    onChange={(e) => updateCriterion(i, { key: e.target.value })}
                  />
                </Field>
                <Field label={tr(t, 'criterionLabel', 'اسم المعيار')} htmlFor={`c-label-${i}`} required className="min-w-40 flex-[2]">
                  <Input
                    id={`c-label-${i}`}
                    value={c.label}
                    maxLength={80}
                    onChange={(e) => updateCriterion(i, { label: e.target.value })}
                  />
                </Field>
                <Field label={tr(t, 'min', 'الأدنى')} htmlFor={`c-min-${i}`} required className="w-20">
                  <Input
                    id={`c-min-${i}`}
                    inputMode="numeric"
                    ltr
                    value={c.min}
                    onChange={(e) => updateCriterion(i, { min: e.target.value.replace(/[^\d-]/g, '') })}
                  />
                </Field>
                <Field label={tr(t, 'max', 'الأقصى')} htmlFor={`c-max-${i}`} required className="w-20">
                  <Input
                    id={`c-max-${i}`}
                    inputMode="numeric"
                    ltr
                    value={c.max}
                    onChange={(e) => updateCriterion(i, { max: e.target.value.replace(/[^\d-]/g, '') })}
                  />
                </Field>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={tc('delete')}
                  onClick={() => removeCriterion(i)}
                  disabled={criteria.length === 1}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Checkbox
            id="tpl-active"
            label={tr(t, 'active', 'نشط')}
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          {!canManage ? (
            <Badge label={tr(t, 'readOnly', 'للعرض فقط')} tone="muted" />
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={tc('delete')}
        message={deleting ? `${deleting.name} — ${tr(t, 'deleteTemplateConfirm', 'هل تريد حذف هذا القالب؟')}` : ''}
        confirmLabel={tc('delete')}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

export type { TemplateRow };
