'use client';

/**
 * EntityCrud: شاشة قائمة+إضافة+تعديل+حذف عامة (بحث/ترتيب/ترقيم/حالات كاملة).
 * النموذج عبر react-hook-form + zod مبني ديناميكيًا من تعريف الحقول.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { ApiClientError, apiDelete, apiPatch, apiPost } from '@/shared/api/client';
import { useList, useErrorText } from '@/shared/hooks/useApi';
import { useRouter } from '@/shared/i18n/navigation';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select, type SelectOption } from '@/shared/ui-kit/select';
import { Textarea } from '@/shared/ui-kit/textarea';
import { Checkbox } from '@/shared/ui-kit/date-picker';
import { SearchInput } from '@/shared/ui-kit/search';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { useToast } from '@/shared/ui-kit/toast';
import { Field, ErrorText, FormGrid } from '@/shared/ui-kit/form';
import { cn } from '@/shared/ui-kit/utils';

export type CrudFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'decimal'
  | 'date'
  | 'select'
  | 'textarea'
  | 'checkbox';

export interface CrudField {
  name: string;
  label: string;
  type: CrudFieldType;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  options?: SelectOption[];
  ltr?: boolean;
  /** الحقل يمتد على كامل العرض في النموذج. */
  full?: boolean;
  defaultValue?: string | boolean;
  hint?: string;
  /** يُعرض عند الإنشاء فقط (مثل كلمة المرور). */
  createOnly?: boolean;
  /** يُعرض عند التعديل فقط. */
  editOnly?: boolean;
}

export type CrudFormValues = Record<string, string | boolean>;

export interface EntityCrudFilter {
  name: string;
  label: string;
  options: SelectOption[];
}

export interface EntityCrudProps<T> {
  title: string;
  subtitle?: string;
  apiPath: string;
  rowId: (row: T) => string;
  columns: DataTableColumn<T>[];
  fields: CrudField[];
  toForm: (row: T) => CrudFormValues;
  toBody: (values: CrudFormValues, row: T | null) => Record<string, unknown>;
  getVersion?: (row: T) => number;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  createLabel?: string;
  editLabel?: string;
  deleteMessage?: (row: T) => string;
  defaultSort?: string;
  filters?: EntityCrudFilter[];
  detailHref?: (row: T) => string;
  toolbarExtra?: ReactNode;
  headerExtra?: ReactNode;
  searchPlaceholder?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INT_RE = /^\d+$/;
const DECIMAL_RE = /^\d*([.,]\d+)?$/;

interface SchemaMessages {
  required: string;
  email: string;
  number: string;
  positive: string;
  minLength: (min: number) => string;
  maxLength: (max: number) => string;
}

function buildSchema(fields: CrudField[], m: SchemaMessages) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.type === 'checkbox') {
      shape[f.name] = z.boolean();
      continue;
    }
    // قيود الطول تبقى على ZodString، ثم نغلّفها بـ refine حسب النوع (refine يُرجع ZodEffects).
    let s: z.ZodString = z.string();
    if (f.required) s = s.min(1, m.required);
    if (f.minLength) s = s.min(f.minLength, m.minLength(f.minLength));
    if (f.maxLength) s = s.max(f.maxLength, m.maxLength(f.maxLength));

    let final: z.ZodTypeAny = s;
    if (f.type === 'email') {
      final = f.required
        ? s.refine((v) => EMAIL_RE.test(v), m.email)
        : s.refine((v) => v === '' || EMAIL_RE.test(v), m.email);
    } else if (f.type === 'number') {
      let checked: z.ZodTypeAny = f.required
        ? s.refine((v) => INT_RE.test(v), m.number)
        : s.refine((v) => v === '' || INT_RE.test(v), m.number);
      const min = f.min;
      if (min !== undefined && min > 0) {
        checked = checked.refine((v) => v === '' || Number(v) >= min, m.positive);
      }
      final = checked;
    } else if (f.type === 'decimal') {
      final = f.required
        ? s.refine((v) => DECIMAL_RE.test(v) && v.trim() !== '' && Number(v.replace(',', '.')) > 0, m.positive)
        : s.refine((v) => v === '' || DECIMAL_RE.test(v), m.number);
    }
    shape[f.name] = final;
  }
  return z.object(shape);
}

export function EntityCrud<T>(props: EntityCrudProps<T>) {
  const {
    title, subtitle, apiPath, rowId, columns, fields, toForm, toBody, getVersion,
    canCreate = false, canEdit = false, canDelete = false,
    createLabel, editLabel, deleteMessage, defaultSort, filters, detailHref,
    toolbarExtra, headerExtra, searchPlaceholder,
  } = props;

  const tc = useTranslations('common');
  const tToast = useTranslations('ui.toast');
  const tVal = useTranslations('ui.validation');
  const toast = useToast();
  const errorText = useErrorText();
  const router = useRouter();

  const list = useList<T>(apiPath, { sort: defaultSort });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const activeFields = useMemo(
    () => fields.filter((f) => (editing ? !f.createOnly : !f.editOnly)),
    [fields, editing],
  );

  const schema = useMemo(
    () =>
      buildSchema(activeFields, {
        required: tVal('required'),
        email: tVal('email'),
        number: tVal('number'),
        positive: tVal('positive'),
        minLength: (min) => tVal('minLength', { min }),
        maxLength: (max) => tVal('maxLength', { max }),
      }),
    [activeFields, tVal],
  );

  const emptyValues = useMemo<CrudFormValues>(() => {
    const d: CrudFormValues = {};
    for (const f of fields) d[f.name] = f.defaultValue ?? (f.type === 'checkbox' ? false : '');
    return d;
  }, [fields]);

  const form = useForm<CrudFormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: emptyValues,
  });

  const openCreate = () => {
    setEditing(null);
    setSubmitError(null);
    form.reset(emptyValues);
    setModalOpen(true);
  };

  const openEdit = (row: T) => {
    setEditing(row);
    setSubmitError(null);
    form.reset(toForm(row));
    setModalOpen(true);
  };

  const onSubmit = async (values: CrudFormValues) => {
    setSubmitError(null);
    const body: Record<string, unknown> = toBody(values, editing);
    if (editing && getVersion) body.version = getVersion(editing);
    try {
      if (editing) await apiPatch(`${apiPath}/${rowId(editing)}`, body);
      else await apiPost(apiPath, body);
      toast.success(editing ? tToast('updated') : tToast('created'));
      setModalOpen(false);
      list.reload();
    } catch (e) {
      if (e instanceof ApiClientError && e.fieldErrors) {
        for (const [key, msgs] of Object.entries(e.fieldErrors)) {
          form.setError(key as never, { message: msgs[0] });
        }
      } else {
        setSubmitError(errorText(e));
      }
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const body = getVersion ? { version: getVersion(deleting) } : undefined;
      await apiDelete(`${apiPath}/${rowId(deleting)}`, body);
      toast.success(tToast('deleted'));
      list.reload();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setDeleting(null);
    }
  };

  const applyFilter = (name: string, value: string) => {
    const next = { ...filterValues, [name]: value };
    setFilterValues(next);
    const params: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(next)) params[k] = v || undefined;
    list.setFilters(params);
  };

  const actionColumn: DataTableColumn<T> | null =
    canEdit || canDelete || detailHref
      ? {
          header: tc('actions'),
          align: 'end',
          cell: (row) => (
            <div
              className="flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
              role="presentation"
            >
              {detailHref ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => router.push(detailHref(row))}>
                  {tc('view')}
                </Button>
              ) : null}
              {canEdit ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(row)}>
                  {editLabel ?? tc('edit')}
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setDeleting(row)}
                >
                  {tc('delete')}
                </Button>
              ) : null}
            </div>
          ),
        }
      : null;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {toolbarExtra}
            {canCreate ? (
              <Button type="button" onClick={openCreate}>
                <Plus className="size-4" aria-hidden />
                {createLabel ?? tc('create')}
              </Button>
            ) : null}
            {headerExtra}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-52 flex-1">
          <SearchInput value={list.list.q} onSearch={list.setQ} placeholder={searchPlaceholder} />
        </div>
        {filters?.map((f) => (
          <div key={f.name} className="w-48">
            <Select
              aria-label={f.label}
              value={filterValues[f.name] ?? ''}
              onChange={(e) => applyFilter(f.name, e.target.value)}
              options={f.options}
              placeholder={`${tc('all')} — ${f.label}`}
            />
          </div>
        ))}
        {list.list.q || Object.values(filterValues).some(Boolean) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterValues({});
              list.resetFilters();
            }}
          >
            {tc('clear')}
          </Button>
        ) : null}
      </div>

      <div className="card p-0">
        <DataTable
          columns={actionColumn ? [...columns, actionColumn] : columns}
          rows={list.data ?? []}
          getRowId={rowId}
          loading={list.loading}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          sort={list.list.sort}
          onSortChange={list.setSort}
          onRowClick={detailHref ? (row) => router.push(detailHref(row)) : undefined}
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

      {/* نموذج الإنشاء/التعديل */}
      <Modal
        open={modalOpen}
        onOpenChange={(o) => {
          if (!form.formState.isSubmitting) setModalOpen(o);
        }}
        title={`${editing ? (editLabel ?? tc('edit')) : (createLabel ?? tc('create'))} — ${title}`}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={form.formState.isSubmitting}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" form="entity-crud-form" loading={form.formState.isSubmitting}>
              {tc('save')}
            </Button>
          </>
        }
      >
        <form id="entity-crud-form" onSubmit={form.handleSubmit((v) => void onSubmit(v))} noValidate>
          {submitError ? (
            <div className="mb-3">
              <ErrorText message={submitError} />
            </div>
          ) : null}
          <FormGrid>
            {activeFields.map((f) => (
              <Field
                key={f.name}
                label={f.type === 'checkbox' ? undefined : f.label}
                htmlFor={`f-${f.name}`}
                required={f.required}
                hint={f.hint}
                error={form.formState.errors[f.name]?.message as string | undefined}
                className={cn(f.full || f.type === 'textarea' ? 'sm:col-span-2' : '')}
              >
                {f.type === 'select' ? (
                  <Select
                    id={`f-${f.name}`}
                    {...form.register(f.name)}
                    options={f.options}
                    invalid={Boolean(form.formState.errors[f.name])}
                  />
                ) : f.type === 'textarea' ? (
                  <Textarea
                    id={`f-${f.name}`}
                    {...form.register(f.name)}
                    invalid={Boolean(form.formState.errors[f.name])}
                  />
                ) : f.type === 'checkbox' ? (
                  <Checkbox
                    id={`f-${f.name}`}
                    label={f.label}
                    checked={Boolean(form.watch(f.name))}
                    onChange={(e) => form.setValue(f.name, e.target.checked, { shouldDirty: true })}
                  />
                ) : (
                  <Input
                    id={`f-${f.name}`}
                    type={f.type === 'decimal' || f.type === 'number' ? 'text' : f.type}
                    inputMode={f.type === 'decimal' ? 'decimal' : f.type === 'number' ? 'numeric' : undefined}
                    ltr={f.ltr ?? (f.type === 'number' || f.type === 'decimal' || f.type === 'email' || f.type === 'tel')}
                    {...form.register(f.name)}
                    invalid={Boolean(form.formState.errors[f.name])}
                  />
                )}
              </Field>
            ))}
          </FormGrid>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={tc('delete')}
        message={deleting ? (deleteMessage ? deleteMessage(deleting) : tc('deleteConfirm')) : ''}
        confirmLabel={tc('delete')}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
