'use client';

/**
 * المصاريف — قائمة بمرشحات (فئة/حالة/تاريخ من-إلى) + إنشاء/تعديل (نص عشري) + إلغاء (سبب ≥5).
 * التبويب الثاني: فئات المصاريف. المال يُرسل كنص عشري؛ والعرض عبر fmt.money (أصغر وحدة).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import type { ExpenseCategoryDto, ExpenseDto } from '@/shared/api/types';
import { ApiClientError, apiPatch, apiPost, newIdempotencyKey } from '@/shared/api/client';
import { useApi, useErrorText, useList } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { minorToDecimal, todayFor } from '@/shared/lib/format';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select } from '@/shared/ui-kit/select';
import { Textarea } from '@/shared/ui-kit/textarea';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import { Modal } from '@/shared/ui-kit/modal';
import { Field, ErrorText, FormGrid } from '@/shared/ui-kit/form';
import { useToast } from '@/shared/ui-kit/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui-kit/tabs';
import { ExpenseCategoriesScreen } from '@/features/expenses/expense-categories-screen';

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ExpenseForm {
  amount: string;
  categoryId: string;
  expenseDate: string;
  description: string;
  beneficiary: string;
}

type Filters = { status?: string; categoryId?: string; dateFrom?: string; dateTo?: string };

export function ExpensesScreen() {
  const tc = useTranslations('common');
  const tExp = useTranslations('expense');
  const ts = useTranslations('status');
  const tv = useTranslations('ui.validation');
  const tToast = useTranslations('ui.toast');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can, settings } = useSession();

  const list = useList<ExpenseDto>('/expenses', { sort: '-expenseDate' });
  const categories = useApi<ExpenseCategoryDto[]>('/expense-categories');
  const [filters, setFilters] = useState<Filters>({});

  const canCreate = can('expenses.create');
  const canEdit = can('expenses.edit');
  const canVoid = can('expenses.delete');

  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const applyFilters = (next: Filters) => {
    setFilters(next);
    list.setFilters({
      status: next.status || undefined,
      categoryId: next.categoryId || undefined,
      dateFrom: next.dateFrom || undefined,
      dateTo: next.dateTo || undefined,
    });
  };

  // ---------- نموذج الإنشاء/التعديل ----------
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDto | null>(null);
  const [form, setForm] = useState<ExpenseForm>({ amount: '', categoryId: '', expenseDate: '', description: '', beneficiary: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm({ amount: '', categoryId: '', expenseDate: todayFor(settings), description: '', beneficiary: '' });
    setErrors({});
    setSubmitError(null);
    setFormOpen(true);
  };

  const openEdit = (row: ExpenseDto) => {
    setEditing(row);
    setForm({
      amount: minorToDecimal(row.amount, settings.currencyDecimals),
      categoryId: row.categoryId,
      expenseDate: row.expenseDate.slice(0, 10),
      description: row.description ?? '',
      beneficiary: row.beneficiary ?? '',
    });
    setErrors({});
    setSubmitError(null);
    setFormOpen(true);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!MONEY_RE.test(form.amount.trim())) next.amount = tv('positive');
    else if (Number(form.amount) <= 0) next.amount = tv('positive');
    if (!form.categoryId) next.categoryId = tv('required');
    if (!DATE_RE.test(form.expenseDate)) next.expenseDate = tv('required');
    if (form.description.length > 2000) next.description = tv('maxLength', { max: 2000 });
    if (form.beneficiary.length > 200) next.beneficiary = tv('maxLength', { max: 200 });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    const body: Record<string, unknown> = {
      amount: form.amount.trim(),
      categoryId: form.categoryId,
      expenseDate: form.expenseDate,
    };
    const desc = form.description.trim();
    const benef = form.beneficiary.trim();
    if (desc) body.description = desc;
    if (benef) body.beneficiary = benef;

    setSaving(true);
    try {
      if (editing) {
        body.version = editing.version;
        await apiPatch(`/expenses/${editing.id}`, body);
        toast.success(tToast('updated'));
      } else {
        await apiPost('/expenses', body, { idempotencyKey: newIdempotencyKey() });
        toast.success(tToast('created'));
      }
      setFormOpen(false);
      list.reload();
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

  // ---------- إلغاء المصروف ----------
  const [voidTarget, setVoidTarget] = useState<ExpenseDto | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidSaving, setVoidSaving] = useState(false);

  const openVoid = (row: ExpenseDto) => {
    setVoidTarget(row);
    setVoidReason('');
    setVoidError(null);
  };

  const submitVoid = async () => {
    if (!voidTarget) return;
    setVoidError(null);
    if (voidReason.trim().length < 5) {
      setVoidError(tv('minLength', { min: 5 }));
      return;
    }
    setVoidSaving(true);
    try {
      await apiPost(
        `/expenses/${voidTarget.id}/void`,
        { reason: voidReason.trim(), version: voidTarget.version },
        { idempotencyKey: newIdempotencyKey() },
      );
      toast.success(tToast('updated'));
      setVoidTarget(null);
      list.reload();
    } catch (e) {
      setVoidError(errorText(e));
    } finally {
      setVoidSaving(false);
    }
  };

  // ---------- عرض التفاصيل ----------
  const [viewTarget, setViewTarget] = useState<ExpenseDto | null>(null);

  const columns: DataTableColumn<ExpenseDto>[] = [
    {
      key: 'expenseDate',
      header: tr(tExp, 'expenseDate', 'تاريخ المصروف'),
      cell: (e) => <span className="ltr-field whitespace-nowrap">{fmt.date(e.expenseDate)}</span>,
      showInCard: true,
    },
    { header: tr(tExp, 'category', 'الفئة'), cell: (e) => e.category?.name ?? '—', showInCard: true },
    {
      header: tr(tExp, 'description', 'البيان'),
      cell: (e) => e.description ?? '—',
      showInCard: false,
    },
    { header: tr(tExp, 'beneficiary', 'المستفيد'), cell: (e) => e.beneficiary ?? '—', showInCard: false },
    {
      key: 'amount',
      header: tc('amount'),
      cell: (e) => <span className="tabular-nums">{fmt.money(e.amount)}</span>,
      align: 'end',
      showInCard: true,
    },
    {
      header: tc('status'),
      cell: (e) => <StatusBadge value={e.status} />,
      showInCard: true,
    },
    {
      header: tc('actions'),
      align: 'end',
      showInCard: false,
      cell: (e) => (
        <div className="flex items-center justify-end gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => setViewTarget(e)}>
            {tc('view')}
          </Button>
          {canEdit && e.status === 'ACTIVE' ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(e)}>
              {tc('edit')}
            </Button>
          ) : null}
          {canVoid && e.status === 'ACTIVE' ? (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => openVoid(e)}>
              {tr(tExp, 'void', 'إلغاء')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={tExp('titlePlural')}
        actions={
          canCreate ? (
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" aria-hidden />
              {tr(tExp, 'newExpense', 'مصروف جديد')}
            </Button>
          ) : null
        }
      />

      <Tabs defaultValue="expenses">
        <TabsList className="mb-4 w-fit">
          <TabsTrigger value="expenses">{tExp('titlePlural')}</TabsTrigger>
          <TabsTrigger value="categories">{tr(tExp, 'categoriesTab', 'الفئات')}</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select
                aria-label={tr(tExp, 'category', 'الفئة')}
                value={filters.categoryId ?? ''}
                placeholder={`${tc('all')} — ${tr(tExp, 'category', 'الفئة')}`}
                options={categoryOptions}
                onChange={(e) => applyFilters({ ...filters, categoryId: e.target.value })}
              />
            </div>
            <div className="w-36">
              <Select
                aria-label={tc('status')}
                value={filters.status ?? ''}
                placeholder={`${tc('all')} — ${tc('status')}`}
                options={[
                  { value: 'ACTIVE', label: ts('ACTIVE') },
                  { value: 'VOIDED', label: ts('VOIDED') },
                ]}
                onChange={(e) => applyFilters({ ...filters, status: e.target.value })}
              />
            </div>
            <div className="w-40">
              <DatePicker
                aria-label={tc('from')}
                value={filters.dateFrom ?? ''}
                onChange={(e) => applyFilters({ ...filters, dateFrom: e.target.value })}
              />
            </div>
            <div className="w-40">
              <DatePicker
                aria-label={tc('to')}
                value={filters.dateTo ?? ''}
                onChange={(e) => applyFilters({ ...filters, dateTo: e.target.value })}
              />
            </div>
            {Object.values(filters).some(Boolean) ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => applyFilters({})}>
                {tc('clear')}
              </Button>
            ) : null}
          </div>

          <div className="card p-0">
            <DataTable
              columns={columns}
              rows={list.data ?? []}
              getRowId={(e) => e.id}
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
        </TabsContent>

        <TabsContent value="categories">
          <ExpenseCategoriesScreen />
        </TabsContent>
      </Tabs>

      {/* نموذج الإنشاء/التعديل */}
      <Modal
        open={formOpen}
        onOpenChange={(o) => {
          if (!saving) setFormOpen(o);
        }}
        title={editing ? tr(tExp, 'editExpense', 'تعديل المصروف') : tr(tExp, 'newExpense', 'مصروف جديد')}
        size="lg"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
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
          <Field label={tc('amount')} htmlFor="exp-amount" required error={errors.amount}>
            <Input
              id="exp-amount"
              type="text"
              inputMode="decimal"
              ltr
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              invalid={Boolean(errors.amount)}
            />
          </Field>
          <Field label={tr(tExp, 'category', 'الفئة')} htmlFor="exp-cat" required error={errors.categoryId}>
            <Select
              id="exp-cat"
              value={form.categoryId}
              placeholder={tc('none')}
              options={categoryOptions}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              invalid={Boolean(errors.categoryId)}
            />
          </Field>
          <Field label={tr(tExp, 'expenseDate', 'تاريخ المصروف')} htmlFor="exp-date" required error={errors.expenseDate}>
            <DatePicker
              id="exp-date"
              value={form.expenseDate}
              onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
              invalid={Boolean(errors.expenseDate)}
            />
          </Field>
          <Field label={tr(tExp, 'beneficiary', 'المستفيد')} htmlFor="exp-benef" optional error={errors.beneficiary}>
            <Input
              id="exp-benef"
              value={form.beneficiary}
              onChange={(e) => setForm((f) => ({ ...f, beneficiary: e.target.value }))}
              maxLength={200}
              invalid={Boolean(errors.beneficiary)}
            />
          </Field>
          <Field
            label={tr(tExp, 'description', 'البيان')}
            htmlFor="exp-desc"
            optional
            error={errors.description}
            className="sm:col-span-2"
          >
            <Textarea
              id="exp-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={2000}
              invalid={Boolean(errors.description)}
            />
          </Field>
        </FormGrid>
      </Modal>

      {/* نافذة الإلغاء */}
      <Modal
        open={voidTarget !== null}
        onOpenChange={(o) => {
          if (!o && !voidSaving) setVoidTarget(null);
        }}
        title={tr(tExp, 'void', 'إلغاء المصروف')}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setVoidTarget(null)} disabled={voidSaving}>
              {tc('cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void submitVoid()} loading={voidSaving}>
              {tr(tExp, 'void', 'إلغاء')}
            </Button>
          </>
        }
      >
        {voidError ? (
          <div className="mb-3">
            <ErrorText message={voidError} />
          </div>
        ) : null}
        <p className="mb-3 text-sm text-muted-foreground">{tr(tExp, 'voidConfirm', 'هل تريد إلغاء هذا المصروف؟')}</p>
        <Field label={tr(tExp, 'voidReason', 'سبب الإلغاء')} htmlFor="void-reason" required>
          <Textarea
            id="void-reason"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            maxLength={1000}
          />
        </Field>
      </Modal>

      {/* نافذة العرض */}
      <Modal
        open={viewTarget !== null}
        onOpenChange={(o) => {
          if (!o) setViewTarget(null);
        }}
        title={tExp('title')}
        footer={
          <Button type="button" variant="outline" onClick={() => setViewTarget(null)}>
            {tc('close')}
          </Button>
        }
      >
        {viewTarget ? (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <DetailItem label={tr(tExp, 'expenseDate', 'تاريخ المصروف')} value={fmt.date(viewTarget.expenseDate)} />
            <DetailItem label={tr(tExp, 'category', 'الفئة')} value={viewTarget.category?.name ?? '—'} />
            <DetailItem
              label={tc('amount')}
              value={<span className="tabular-nums ltr-field">{fmt.money(viewTarget.amount)}</span>}
            />
            <DetailItem label={tc('status')} value={<StatusBadge value={viewTarget.status} />} />
            <DetailItem label={tr(tExp, 'beneficiary', 'المستفيد')} value={viewTarget.beneficiary ?? '—'} />
            <DetailItem label={tr(tExp, 'description', 'البيان')} value={viewTarget.description ?? '—'} />
            <DetailItem label={tc('createdAt')} value={fmt.dateTime(viewTarget.createdAt)} />
            {viewTarget.status === 'VOIDED' ? (
              <DetailItem
                label={tr(tExp, 'voidReason', 'سبب الإلغاء')}
                value={viewTarget.voidReason ?? '—'}
              />
            ) : null}
          </dl>
        ) : null}
      </Modal>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
