'use client';

/**
 * تفاصيل الدفعة — عرض الوصل، إعادة الطباعة، إلغاء بسبب (void)، استرداد كلي/جزئي بسبب.
 * الدفعة غير قابلة للتعديل — التصحيح بالإلغاء/الاسترداد فقط.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Printer, ReceiptText, Undo2 } from 'lucide-react';
import { newIdempotencyKey } from '@/shared/api/client';
import type { PaymentDto } from '@/shared/api/types';
import { useApi, useErrorText, useMutation, makeApiMutation } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { Link } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { toMinorUnits } from '@/shared/money';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Textarea } from '@/shared/ui-kit/textarea';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { Loading } from '@/shared/ui-kit/loading';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { Field, ErrorText } from '@/shared/ui-kit/form';
import { useToast } from '@/shared/ui-kit/toast';

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium">{value ?? '—'}</span>
    </div>
  );
}

export function PaymentDetailScreen({ id }: { id: string }) {
  const t = useTranslations('payment');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can, settings } = useSession();

  const payment = useApi<PaymentDto>(`/payments/${id}`);

  const [voidOpen, setVoidOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const voidMutation = useMutation(
    makeApiMutation<{ reason: string }, PaymentDto>(() => `/payments/${id}/void`, 'POST'),
  );
  const refundMutation = useMutation(
    makeApiMutation<{ amount: string; reason: string }, PaymentDto>(() => `/payments/${id}/refund`, 'POST'),
  );
  const reprintMutation = useMutation(
    makeApiMutation<Record<string, never>, unknown>(() => `/receipts/${payment.data?.receiptId ?? ''}/reprint`, 'POST'),
  );

  if (payment.loading) return <Loading label={tc('loading')} />;
  if (payment.error) return <ErrorState message={errorText(payment.error)} onRetry={payment.reload} />;
  if (!payment.data) return <EmptyState />;

  const p = payment.data;
  const pending = voidMutation.pending || refundMutation.pending || reprintMutation.pending;
  const refundableMinor = BigInt(p.netAmount) - BigInt(p.refundedAmount);

  const closeAll = () => {
    setVoidOpen(false);
    setRefundOpen(false);
    setReason('');
    setRefundAmount('');
    setActionError(null);
  };

  const doVoid = async () => {
    if (reason.trim().length < 5) {
      setActionError(tc('required'));
      return;
    }
    setActionError(null);
    const r = await voidMutation.mutate({ reason: reason.trim() }, { idempotencyKey: newIdempotencyKey() });
    if (r) {
      toast.success(tc('success'));
      closeAll();
      payment.reload();
    } else if (voidMutation.error) {
      setActionError(errorText(voidMutation.error));
    }
  };

  const doRefund = async () => {
    setActionError(null);
    if (!MONEY_RE.test(refundAmount) || Number(refundAmount) <= 0) {
      setActionError(tc('required'));
      return;
    }
    // رفض تجاوز القابل للاسترداد في العميل
    if (toMinorUnits(refundAmount, settings.currencyDecimals) > refundableMinor) {
      setActionError(t('refundMax', { amount: fmt.money(refundableMinor.toString()) }));
      return;
    }
    if (reason.trim().length < 5) {
      setActionError(tc('required'));
      return;
    }
    const r = await refundMutation.mutate(
      { amount: refundAmount, reason: reason.trim() },
      { idempotencyKey: newIdempotencyKey() },
    );
    if (r) {
      toast.success(tc('success'));
      closeAll();
      payment.reload();
    } else if (refundMutation.error) {
      setActionError(errorText(refundMutation.error));
    }
  };

  const doReprint = async () => {
    if (!p.receiptId) return;
    setActionError(null);
    const r = await reprintMutation.mutate({}, { idempotencyKey: newIdempotencyKey() });
    if (r) {
      toast.success(tc('success'));
      payment.reload();
    } else if (reprintMutation.error) {
      const msg = errorText(reprintMutation.error);
      setActionError(msg);
      toast.error(msg);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={`${p.athleteName} — ${fmt.money(p.netAmount)}`}
        backHref="/payments"
        backLabel={tc('back')}
        actions={
          <>
            {p.receiptId ? (
              <Link href={`/payments/${p.id}/receipt`}>
                <Button type="button" variant="outline">
                  <ReceiptText className="size-4" aria-hidden />
                  {t('viewReceipt')}
                </Button>
              </Link>
            ) : null}
            {can('payments.reprint_receipt') && p.receiptId && p.status === 'COMPLETED' ? (
              <Button type="button" variant="outline" onClick={() => void doReprint()} loading={reprintMutation.pending}>
                <Printer className="size-4" aria-hidden />
                {t('reprint')}
              </Button>
            ) : null}
            {can('payments.refund') && p.status === 'COMPLETED' && refundableMinor > 0n ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReason('');
                  setRefundAmount('');
                  setActionError(null);
                  setRefundOpen(true);
                }}
              >
                <Undo2 className="size-4" aria-hidden />
                {t('refund')}
              </Button>
            ) : null}
            {can('payments.void') && p.status === 'COMPLETED' ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setReason('');
                  setActionError(null);
                  setVoidOpen(true);
                }}
              >
                <Ban className="size-4" aria-hidden />
                {t('void')}
              </Button>
            ) : null}
          </>
        }
      />

      {actionError && !voidOpen && !refundOpen ? (
        <div className="mb-3">
          <ErrorText message={actionError} />
        </div>
      ) : null}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3">
          <StatusBadge value={p.status} />
          <Badge label={p.paymentMethodName} tone="accent" />
          <span className="ltr-field font-mono text-xs text-muted-foreground">{p.transactionNo}</span>
          {p.receiptNo ? (
            <span className="ltr-field font-mono text-xs text-muted-foreground">
              {t('receiptNo')}: {p.receiptNo}
            </span>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{tc('details')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow
              label={t('athlete')}
              value={
                <Link href={`/athletes/${p.athleteId}`} className="text-primary hover:underline">
                  {p.athleteName} <span className="ltr-field font-mono text-xs">{p.registrationNo}</span>
                </Link>
              }
            />
            <InfoRow
              label={t('selectSubscription')}
              value={
                <Link href={`/subscriptions/${p.subscriptionId}`} className="text-primary hover:underline">
                  {p.subscriptionTypeName}
                </Link>
              }
            />
            <InfoRow label={t('paymentDate')} value={fmt.date(p.paymentDate)} />
            <InfoRow label={t('method')} value={p.paymentMethodName} />
            <InfoRow label={tc('createdAt')} value={fmt.dateTime(p.createdAt)} />
            {p.notes ? <InfoRow label={tc('notes')} value={p.notes} /> : null}
            {p.voidReason ? <InfoRow label={t('voidReason')} value={p.voidReason} /> : null}
            {p.voidedAt ? <InfoRow label={t('void')} value={fmt.dateTime(p.voidedAt)} /> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('amount')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label={t('amount')} value={<span className="tabular-nums">{fmt.money(p.amount)}</span>} />
            {p.discount !== '0' ? (
              <InfoRow
                label={t('discount')}
                value={<span className="tabular-nums text-warning">−{fmt.money(p.discount)}</span>}
              />
            ) : null}
            <InfoRow label={t('netAmount')} value={<span className="tabular-nums font-bold">{fmt.money(p.netAmount)}</span>} />
            {p.refundedAmount !== '0' ? (
              <InfoRow
                label={t('refundAmount')}
                value={<span className="tabular-nums text-destructive">−{fmt.money(p.refundedAmount)}</span>}
              />
            ) : null}
            <InfoRow label={t('subscriptionRemaining')} value={<span className="tabular-nums">{fmt.money(p.subscriptionRemaining)}</span>} />
          </CardContent>
        </Card>
      </div>

      {/* إلغاء الدفعة — سبب إلزامي */}
      <ConfirmDialog
        open={voidOpen}
        onOpenChange={(o) => !pending && setVoidOpen(o)}
        title={t('void')}
        message={
          <div className="space-y-3">
            <p>{t('voidConfirm')}</p>
            {actionError ? <ErrorText message={actionError} /> : null}
            <Field label={t('voidReason')} htmlFor="pay-void-reason" required>
              <Textarea id="pay-void-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
        }
        tone="danger"
        confirmLabel={t('void')}
        loading={voidMutation.pending}
        onConfirm={() => void doVoid()}
      />

      {/* استرداد — مبلغ + سبب إلزاميان */}
      <Modal
        open={refundOpen}
        onOpenChange={(o) => !pending && setRefundOpen(o)}
        title={t('refund')}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setRefundOpen(false)} disabled={pending}>
              {tc('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void doRefund()}
              loading={refundMutation.pending}
              disabled={!MONEY_RE.test(refundAmount) || reason.trim().length < 5}
            >
              {t('refund')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {actionError ? <ErrorText message={actionError} /> : null}
          <p className="text-xs text-muted-foreground">{t('refundMax', { amount: fmt.money(refundableMinor.toString()) })}</p>
          <Field label={t('refundAmount')} htmlFor="pay-refund-amount" required>
            <Input
              id="pay-refund-amount"
              type="text"
              inputMode="decimal"
              ltr
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              invalid={refundAmount !== '' && !MONEY_RE.test(refundAmount)}
            />
          </Field>
          <Field label={t('refundReason')} htmlFor="pay-refund-reason" required>
            <Textarea id="pay-refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
