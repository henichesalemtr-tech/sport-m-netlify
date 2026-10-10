'use client';

/**
 * فئات المصاريف — قائمة غير مرقّمة (GET يعيد مصفوفة) + إضافة/تعديل/حذف.
 * البحث يتم في العميل لأن مسار الخادم لا يدعم q/filters.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import type { ExpenseCategoryDto } from '@/shared/api/types';
import { ApiClientError, apiDelete, apiPatch, apiPost, newIdempotencyKey } from '@/shared/api/client';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { tr } from '@/features/common/tr';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Checkbox } from '@/shared/ui-kit/date-picker';
import { SearchInput } from '@/shared/ui-kit/search';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { useToast } from '@/shared/ui-kit/toast';
import { Field, ErrorText, FormGrid } from '@/shared/ui-kit/form';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { Loading } from '@/shared/ui-kit/loading';

const INT_RE = /^\d+$/;

interface CategoryForm {
  name: string;
  sortOrder: string;
  isActive: boolean;
}

const emptyForm: CategoryForm = { name: '', sortOrder: '0', isActive: true };

export function ExpenseCategoriesScreen() {
  const tc = useTranslations('common');
  const tExp = useTranslations('expense');
  const tToast = useTranslations('ui.toast');
  const tv = useTranslations('ui.validation');
  const errorText = useErrorText();
  const toast = useToast();
  const { can } = useSession();

  const categories = useApi<ExpenseCategoryDto[]>('/expense-categories');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategoryDto | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseCategoryDto | null>(null);
  const [removing, setRemoving] = useState(false);

  const rows = useMemo(() => {
    const all = categories.data ?? [];
    const term = query.trim();
    if (!term) return all;
    return all.filter((c) => c.name.includes(term));
  }, [categories.data, query]);

  const canCreate = can('expenses.create');
  const canEdit = can('expenses.edit');
  const canDelete = can('expenses.delete');

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setSubmitError(null);
    setModalOpen(true);
  };

  const openEdit = (row: ExpenseCategoryDto) => {
    setEditing(row);
    setForm({ name: row.name, sortOrder: String(row.sortOrder), isActive: row.isActive });
    setErrors({});
    setSubmitError(null);
    setModalOpen(true);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const name = form.name.trim();
    if (name.length < 2) next.name = tv('minLength', { min: 2 });
    else if (name.length > 100) next.name = tv('maxLength', { max: 100 });
    if (form.sortOrder !== '' && !INT_RE.test(form.sortOrder)) next.sortOrder = tv('integer');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      isActive: form.isActive,
    };
    if (form.sortOrder !== '' && INT_RE.test(form.sortOrder)) body.sortOrder = Number(form.sortOrder);
    return body;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    const body = buildBody();
    setSaving(true);
    try {
      if (editing) await apiPatch(`/expense-categories/${editing.id}`, body);
      else await apiPost('/expense-categories', body, { idempotencyKey: newIdempotencyKey() });
      toast.success(editing ? tToast('updated') : tToast('created'));
      setModalOpen(false);
      categories.reload();
    } catch (e) {
      if (e instanceof ApiClientError && e.fieldErrors) {
        const mapped: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(e.fieldErrors)) mapped[key] = msgs[0] ?? tv('required');
        setErrors(mapped);
      } else {
        setSubmitError(errorText(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await apiDelete(`/expense-categories/${deleting.id}`);
      toast.success(tToast('deleted'));
      categories.reload();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setRemoving(false);
      setDeleting(null);
    }
  };

  const columns: DataTableColumn<ExpenseCategoryDto>[] = [
    { key: 'name', header: tc('name'), cell: (c) => <span className="font-medium">{c.name}</span>, showInCard: true },
    {
      header: tc('sort'),
      cell: (c) => <span className="tabular-nums ltr-field">{c.sortOrder}</span>,
      showInCard: true,
    },
    {
      header: tc('status'),
      cell: (c) =>
        c.isActive ? <StatusBadge value="ACTIVE" /> : <Badge label={tc('disabled')} tone="muted" />,
      showInCard: true,
    },
    {
      header: tc('actions'),
      align: 'end',
      showInCard: false,
      cell: (c) =>
        canEdit || canDelete ? (
          <div className="flex items-center justify-end gap-1">
            {canEdit ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(c)}>
                {tc('edit')}
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => setDeleting(c)}
              >
                {tc('delete')}
              </Button>
            ) : null}
          </div>
        ) : (
          <span>—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={tr(tExp, 'categoriesTab', 'الفئات')}
        actions={
          canCreate ? (
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" aria-hidden />
              {tr(tExp, 'newCategory', 'فئة جديدة')}
            </Button>
          ) : null
        }
      />

      <div className="mb-3">
        <div className="min-w-52 max-w-sm">
          <SearchInput value={q} onSearch={setQuery} placeholder={tc('searchPlaceholder')} />
        </div>
      </div>

      {categories.loading && !categories.data ? (
        <Loading label={tc('loading')} />
      ) : categories.error ? (
        <div className="card p-0">
          <ErrorState message={errorText(categories.error)} onRetry={categories.reload} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-0">
          <EmptyState title={tc('noData')} />
        </div>
      ) : (
        <div className="card p-0">
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(c) => c.id}
            loading={categories.loading}
            sort={undefined}
          />
        </div>
      )}

      <Modal
        open={modalOpen}
        onOpenChange={(o) => {
          if (!saving) setModalOpen(o);
        }}
        title={`${editing ? tc('edit') : tc('create')} — ${tr(tExp, 'category', 'فئة المصروف')}`}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              {tc('cancel')}
            </Button>
            <Button type="button" onClick={() => void submit()} loading={saving}>
              {tc('save')}
            </Button>
          </>
        }
      >
        {submitError ? (
          <div className="mb-3">
            <ErrorText message={submitError} />
          </div>
        ) : null}
        <FormGrid>
          <Field label={tc('name')} htmlFor="cat-name" required error={errors.name} className="sm:col-span-2">
            <Input
              id="cat-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              invalid={Boolean(errors.name)}
              maxLength={100}
            />
          </Field>
          <Field label={tc('sort')} htmlFor="cat-sort" error={errors.sortOrder}>
            <Input
              id="cat-sort"
              type="text"
              inputMode="numeric"
              ltr
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              invalid={Boolean(errors.sortOrder)}
            />
          </Field>
          <Field label={tc('status')}>
            <Checkbox
              id="cat-active"
              label={form.isActive ? tc('active') : tc('disabled')}
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
          </Field>
        </FormGrid>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && !removing && setDeleting(null)}
        title={tc('delete')}
        message={`${tr(tExp, 'deleteConfirm', 'هل تريد حذف هذه الفئة؟')}${deleting ? ` — ${deleting.name}` : ''}`}
        confirmLabel={tc('delete')}
        loading={removing}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
