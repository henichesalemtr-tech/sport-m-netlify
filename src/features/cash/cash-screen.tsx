'use client';

/**
 * الخزينة — الرصيد الحالي + دفتر الحركات + الإغلاقات، مع عمليات: رصيد افتتاحي/تسوية/إغلاق يوم.
 * المبالغ تُرسل كنصوص عشرية (الموقّعة للتسوية) ومفتاح Idempotency. العرض عبر fmt.money (أصغر وحدة).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote, Lock, Scale } from 'lucide-react';
import type { CashClosingDto, CashTransactionDto } from '@/shared/api/types';
import { ApiClientError, apiPost, newIdempotencyKey } from '@/shared/api/client';
import { useApi, useErrorText, useList } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { todayFor } from '@/shared/lib/format';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select } from '@/shared/ui-kit/select';
import { Textarea } from '@/shared/ui-kit/textarea';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatsCard } from '@/shared/ui-kit/stats-card';
import { Badge } from '@/shared/ui-kit/status-badge';
import { Modal } from '@/shared/ui-kit/modal';
import { Field, ErrorText, FormGrid } from '@/shared/ui-kit/form';
import { useToast } from '@/shared/ui-kit/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui-kit/tabs';

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const SIGNED_RE = /^-?\d+(\.\d{1,2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TX_TYPES = ['OPENING_BALANCE', 'INCOME', 'EXPENSE', 'ADJUSTMENT', 'REVERSAL'] as const;

interface LedgerData {
  items: CashTransactionDto[];
  balance: string;
}

export function CashScreen() {
  const tc = useTranslations('common');
  const tCash = useTranslations('cash');
  const tTx = useTranslations('cash.txTypes');
  const tv = useTranslations('ui.validation');
  const tToast = useTranslations('ui.toast');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can, settings } = useSession();

  const canManage = can('cash.adjust');
  const canClose = can('cash.close_day');

  // ---------- دفتر الحركات ----------
  const [txType, setTxType] = useState('');
  const [txFrom, setTxFrom] = useState('');
  const [txTo, setTxTo] = useState('');
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(20);

  const txParams = useMemo(
    () => ({
      page: txPage,
      pageSize: txPageSize,
      type: txType || undefined,
      dateFrom: txFrom || undefined,
      dateTo: txTo || undefined,
    }),
    [txPage, txPageSize, txType, txFrom, txTo],
  );

  const ledger = useApi<LedgerData>('/cash/transactions', { params: txParams });
  const ledgerRows = ledger.data?.items ?? [];
  const balanceMinor = ledger.data?.balance;
  const totalPages = ledger.meta?.totalPages ?? 1;
  const total = ledger.meta?.total ?? 0;

  const applyLedgerFilters = () => setTxPage(1);

  // ---------- الإغلاقات ----------
  const closings = useList<CashClosingDto>('/cash/closings', { sort: '-closingDate' });
  const [clFrom, setClFrom] = useState('');
  const [clTo, setClTo] = useState('');
  const applyClosingFilters = () => {
    closings.setFilters({ dateFrom: clFrom || undefined, dateTo: clTo || undefined });
  };

  // ---------- نافذة عملية ----------
  type ActionKind = 'open' | 'adjust' | 'close';
  const [action, setAction] = useState<ActionKind | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayFor(settings));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openAction = (kind: ActionKind) => {
    setAction(kind);
    setAmount('');
    setDate(todayFor(settings));
    setReason('');
    setErrors({});
    setSubmitError(null);
  };

  const validateAction = (): boolean => {
    const next: Record<string, string> = {};
    if (!action) return false;
    if (action === 'open' || action === 'close') {
      if (!MONEY_RE.test(amount.trim())) next.amount = tv('positive');
      else if (Number(amount) <= 0) next.amount = tv('positive');
    } else {
      if (!SIGNED_RE.test(amount.trim())) next.amount = tv('number');
      else if (Number(amount) === 0) next.amount = tv('positive');
    }
    if (!DATE_RE.test(date)) next.date = tv('required');
    if (action === 'adjust' && reason.trim().length < 5) next.reason = tv('minLength', { min: 5 });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitAction = async () => {
    setSubmitError(null);
    if (!action) return;
    if (!validateAction()) return;
    const trimmedAmount = amount.trim();
    const body: Record<string, unknown> = {};
    let path = '';
    if (action === 'open') {
      path = '/cash/opening';
      body.amount = trimmedAmount;
      body.txDate = date;
      if (reason.trim()) body.reason = reason.trim();
    } else if (action === 'adjust') {
      path = '/cash/adjust';
      body.amount = trimmedAmount;
      body.txDate = date;
      body.reason = reason.trim();
    } else {
      path = '/cash/close-day';
      body.closingDate = date;
      body.countedAmount = trimmedAmount;
      if (reason.trim()) body.reason = reason.trim();
    }
    setSaving(true);
    try {
      await apiPost(path, body, { idempotencyKey: newIdempotencyKey() });
      toast.success(tToast('created'));
      setAction(null);
      ledger.reload();
      closings.reload();
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

  const signedCell = (minor: string) => {
    let negative = false;
    try {
      negative = BigInt(minor) < 0n;
    } catch {
      negative = false;
    }
    return <span className={negative ? 'tabular-nums ltr-field text-destructive' : 'tabular-nums ltr-field text-success'}>{fmt.money(minor)}</span>;
  };

  const txColumns: DataTableColumn<CashTransactionDto>[] = [
    {
      header: tc('type'),
      cell: (t) => <Badge label={tr(tTx, t.type, t.type)} tone="muted" />,
      showInCard: true,
    },
    {
      header: tc('date'),
      cell: (t) => <span className="ltr-field whitespace-nowrap">{fmt.date(t.txDate)}</span>,
      showInCard: true,
    },
    { header: tc('amount'), cell: (t) => signedCell(t.amount), align: 'end', showInCard: true },
    {
      header: tr(tCash, 'balance', 'الرصيد'),
      cell: (t) => <span className="tabular-nums ltr-field">{fmt.money(t.balanceAfter)}</span>,
      align: 'end',
      showInCard: false,
    },
    { header: tr(tCash, 'reference', 'المرجع'), cell: (t) => t.referenceType ?? '—', showInCard: false },
    { header: tc('reason'), cell: (t) => t.reason ?? '—', showInCard: false },
  ];

  const closingColumns: DataTableColumn<CashClosingDto>[] = [
    {
      header: tr(tCash, 'closingDate', 'تاريخ الإغلاق'),
      cell: (c) => <span className="ltr-field whitespace-nowrap">{fmt.date(c.closingDate)}</span>,
      showInCard: true,
    },
    {
      header: tr(tCash, 'expectedAmount', 'المتوقع'),
      cell: (c) => <span className="tabular-nums ltr-field">{fmt.money(c.expectedAmount)}</span>,
      align: 'end',
      showInCard: true,
    },
    {
      header: tr(tCash, 'countedAmount', 'المعدود'),
      cell: (c) => <span className="tabular-nums ltr-field">{fmt.money(c.countedAmount)}</span>,
      align: 'end',
      showInCard: true,
    },
    {
      header: tr(tCash, 'difference', 'الفرق'),
      cell: (c) => signedCell(c.difference),
      align: 'end',
      showInCard: true,
    },
    { header: tc('reason'), cell: (c) => c.reason ?? '—', showInCard: false },
    { header: tc('createdAt'), cell: (c) => <span className="ltr-field whitespace-nowrap">{fmt.dateTime(c.closedAt)}</span>, showInCard: false },
  ];

  const amountLabel =
    action === 'open'
      ? tr(tCash, 'openingAmount', 'مبلغ الفتح')
      : action === 'close'
        ? tr(tCash, 'countedAmount', 'المبلغ المعدود')
        : tc('amount');
  const dateLabel = action === 'close' ? tr(tCash, 'closingDate', 'تاريخ الإغلاق') : tc('date');
  const titleMap: Record<ActionKind, string> = {
    open: tr(tCash, 'openingBalance', 'الرصيد الافتتاحي'),
    adjust: tr(tCash, 'adjustment', 'تسوية نقدية'),
    close: tr(tCash, 'closeDay', 'إغلاق اليوم'),
  };

  return (
    <div>
      <PageHeader
        title={tCash('title')}
        actions={
          <>
            {canManage ? (
              <>
                <Button type="button" variant="outline" onClick={() => openAction('open')}>
                  <Banknote className="size-4" aria-hidden />
                  {tr(tCash, 'openDay', 'رصيد افتتاحي')}
                </Button>
                <Button type="button" variant="outline" onClick={() => openAction('adjust')}>
                  <Scale className="size-4" aria-hidden />
                  {tr(tCash, 'adjust', 'تسوية')}
                </Button>
              </>
            ) : null}
            {canClose ? (
              <Button type="button" onClick={() => openAction('close')}>
                <Lock className="size-4" aria-hidden />
                {tr(tCash, 'closeDay', 'إغلاق اليوم')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 max-w-sm">
        <StatsCard
          title={tr(tCash, 'balance', 'الرصيد الحالي')}
          value={balanceMinor !== undefined ? fmt.money(balanceMinor) : '—'}
          icon={Banknote}
          loading={ledger.loading && !ledger.data}
          tone={balanceMinor !== undefined && BigInt(balanceMinor) < 0n ? 'destructive' : 'success'}
        />
      </div>

      <Tabs defaultValue="ledger">
        <TabsList className="mb-4 w-fit">
          <TabsTrigger value="ledger">{tr(tCash, 'transactions', 'الحركات')}</TabsTrigger>
          <TabsTrigger value="closings">{tr(tCash, 'closings', 'الإغلاقات السابقة')}</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select
                aria-label={tc('type')}
                value={txType}
                placeholder={`${tc('all')} — ${tc('type')}`}
                options={TX_TYPES.map((tp) => ({ value: tp, label: tr(tTx, tp, tp) }))}
                onChange={(e) => {
                  setTxType(e.target.value);
                  setTxPage(1);
                }}
              />
            </div>
            <div className="w-40">
              <DatePicker aria-label={tc('from')} value={txFrom} onChange={(e) => { setTxFrom(e.target.value); applyLedgerFilters(); }} />
            </div>
            <div className="w-40">
              <DatePicker aria-label={tc('to')} value={txTo} onChange={(e) => { setTxTo(e.target.value); applyLedgerFilters(); }} />
            </div>
          </div>

          <div className="card p-0">
            <DataTable
              columns={txColumns}
              rows={ledgerRows}
              getRowId={(t) => t.id}
              loading={ledger.loading}
              error={ledger.error ? errorText(ledger.error) : null}
              onRetry={ledger.reload}
            />
            <Pagination
              page={txPage}
              totalPages={totalPages}
              total={total}
              pageSize={txPageSize}
              onPageChange={setTxPage}
              onPageSizeChange={(s) => {
                setTxPageSize(s);
                setTxPage(1);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="closings">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="w-40">
              <DatePicker aria-label={tc('from')} value={clFrom} onChange={(e) => setClFrom(e.target.value)} />
            </div>
            <div className="w-40">
              <DatePicker aria-label={tc('to')} value={clTo} onChange={(e) => setClTo(e.target.value)} />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={applyClosingFilters}>
              {tc('apply')}
            </Button>
          </div>

          <div className="card p-0">
            <DataTable
              columns={closingColumns}
              rows={closings.data ?? []}
              getRowId={(c) => c.id}
              loading={closings.loading}
              error={closings.error ? errorText(closings.error) : null}
              onRetry={closings.reload}
              sort={closings.list.sort}
              onSortChange={closings.setSort}
            />
            <Pagination
              page={closings.list.page}
              totalPages={closings.totalPages}
              total={closings.total}
              pageSize={closings.list.pageSize}
              onPageChange={closings.setPage}
              onPageSizeChange={closings.setPageSize}
            />
          </div>
        </TabsContent>
      </Tabs>

      <Modal
        open={action !== null}
        onOpenChange={(o) => {
          if (!o && !saving) setAction(null);
        }}
        title={action ? titleMap[action] : ''}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setAction(null)} disabled={saving}>
              {tc('cancel')}
            </Button>
            <Button type="button" onClick={() => void submitAction()} loading={saving}>
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
        {action === 'adjust' ? (
          <p className="mb-3 text-xs text-muted-foreground">{tr(tCash, 'adjustHint', 'مبلغ موجب للزيادة وسالب للنقصان مع سبب إلزامي')}</p>
        ) : null}
        {action === 'close' ? (
          <p className="mb-3 text-xs text-muted-foreground">{tr(tCash, 'closeDayHint', 'أدخل المبلغ المعدود فعليًا؛ أي فرق يتطلب سببًا')}</p>
        ) : null}
        <FormGrid>
          <Field label={amountLabel} htmlFor="cash-amount" required error={errors.amount}>
            <Input
              id="cash-amount"
              type="text"
              inputMode="decimal"
              ltr
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              invalid={Boolean(errors.amount)}
            />
          </Field>
          <Field label={dateLabel} htmlFor="cash-date" required error={errors.date}>
            <DatePicker
              id="cash-date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              invalid={Boolean(errors.date)}
            />
          </Field>
          <Field
            label={tc('reason')}
            htmlFor="cash-reason"
            required={action === 'adjust'}
            optional={action !== 'adjust'}
            error={errors.reason}
            className="sm:col-span-2"
          >
            <Textarea
              id="cash-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              invalid={Boolean(errors.reason)}
            />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
