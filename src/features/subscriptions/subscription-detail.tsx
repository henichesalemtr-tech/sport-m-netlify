'use client';

/** تفاصيل الاشتراك — الإجراءات: تجديد، تعليق/استئناف، إلغاء بسبب إلزامي. */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, CircleDollarSign, PauseCircle, Pencil, PlayCircle } from 'lucide-react';
import { newIdempotencyKey } from '@/shared/api/client';
import type { SubscriptionDto } from '@/shared/api/types';
import { useApi, useErrorText, useMutation, makeApiMutation } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter, Link } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { todayFor } from '@/shared/lib/format';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { Button } from '@/shared/ui-kit/button';
import { Textarea } from '@/shared/ui-kit/textarea';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { Loading } from '@/shared/ui-kit/loading';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { Field, ErrorText } from '@/shared/ui-kit/form';
import { useToast } from '@/shared/ui-kit/toast';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium">{value ?? '—'}</span>
    </div>
  );
}

export function SubscriptionDetailScreen({ id }: { id: string }) {
  const t = useTranslations('subscription');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const toast = useToast();
  const router = useRouter();
  const fmt = useFormatters();
  const { can, settings } = useSession();

  const sub = useApi<SubscriptionDto>(`/subscriptions/${id}`);

  const [renewOpen, setRenewOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [suspendEnd, setSuspendEnd] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const renewMutation = useMutation(
    makeApiMutation<{ version: number }, SubscriptionDto>(() => `/subscriptions/${id}/renew`, 'POST'),
  );
  const suspendMutation = useMutation(
    makeApiMutation<{ reason: string; suspendEnd?: string; version: number }, SubscriptionDto>(
      () => `/subscriptions/${id}/suspend`,
      'POST',
    ),
  );
  const resumeMutation = useMutation(
    makeApiMutation<{ version: number }, SubscriptionDto>(() => `/subscriptions/${id}/resume`, 'POST'),
  );
  const cancelMutation = useMutation(
    makeApiMutation<{ reason: string; version: number }, SubscriptionDto>(() => `/subscriptions/${id}/cancel`, 'POST'),
  );

  if (sub.loading) return <Loading label={tc('loading')} />;
  if (sub.error) return <ErrorState message={errorText(sub.error)} onRetry={sub.reload} />;
  if (!sub.data) return <EmptyState />;

  const s = sub.data;
  const pending = renewMutation.pending || suspendMutation.pending || resumeMutation.pending || cancelMutation.pending;

  const finish = (ok: boolean, message: string) => {
    if (ok) {
      toast.success(message);
      setRenewOpen(false);
      setSuspendOpen(false);
      setResumeOpen(false);
      setCancelOpen(false);
      setReason('');
      setSuspendEnd('');
      setActionError(null);
      sub.reload();
    }
  };

  const doRenew = async () => {
    setActionError(null);
    const r = await renewMutation.mutate({ version: s.version }, { idempotencyKey: newIdempotencyKey() });
    if (r) finish(true, t('renew'));
    else if (renewMutation.error) setActionError(errorText(renewMutation.error));
  };

  const doSuspend = async () => {
    if (reason.trim().length < 5) {
      setActionError(tc('required'));
      return;
    }
    setActionError(null);
    const r = await suspendMutation.mutate({
      reason: reason.trim(),
      suspendEnd: suspendEnd || undefined,
      version: s.version,
    });
    if (r) finish(true, t('suspend'));
    else if (suspendMutation.error) setActionError(errorText(suspendMutation.error));
  };

  const doResume = async () => {
    setActionError(null);
    const r = await resumeMutation.mutate({ version: s.version });
    if (r) finish(true, t('resume'));
    else if (resumeMutation.error) setActionError(errorText(resumeMutation.error));
  };

  const doCancel = async () => {
    if (reason.trim().length < 5) {
      setActionError(tc('required'));
      return;
    }
    setActionError(null);
    const r = await cancelMutation.mutate(
      { reason: reason.trim(), version: s.version },
      { idempotencyKey: newIdempotencyKey() },
    );
    if (r) finish(true, t('cancelSub'));
    else if (cancelMutation.error) setActionError(errorText(cancelMutation.error));
  };

  const canAct = s.status !== 'CANCELLED';

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={`${s.athleteName} — ${s.subscriptionTypeName}`}
        backHref="/subscriptions"
        backLabel={tc('back')}
        actions={
          <>
            {can('payments.create') && s.status !== 'CANCELLED' ? (
              <Link href={`/payments/new?athleteId=${s.athleteId}&subscriptionId=${s.id}`}>
                <Button type="button" variant="outline">
                  <CircleDollarSign className="size-4" aria-hidden />
                  {t('payNow')}
                </Button>
              </Link>
            ) : null}
            {can('subscriptions.edit') && canAct ? (
              <Button type="button" variant="outline" onClick={() => router.push(`/subscriptions/${s.id}/edit`)}>
                <Pencil className="size-4" aria-hidden />
                {tc('edit')}
              </Button>
            ) : null}
            {can('subscriptions.create') && (s.status === 'ACTIVE' || s.status === 'EXPIRED' || s.effectivelyExpired) ? (
              <Button type="button" variant="outline" onClick={() => setRenewOpen(true)}>
                {t('renew')}
              </Button>
            ) : null}
            {can('subscriptions.suspend') && s.status === 'ACTIVE' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReason('');
                  setSuspendEnd('');
                  setActionError(null);
                  setSuspendOpen(true);
                }}
              >
                <PauseCircle className="size-4" aria-hidden />
                {t('suspend')}
              </Button>
            ) : null}
            {can('subscriptions.suspend') && s.status === 'SUSPENDED' ? (
              <Button type="button" variant="outline" onClick={() => setResumeOpen(true)}>
                <PlayCircle className="size-4" aria-hidden />
                {t('resume')}
              </Button>
            ) : null}
            {can('subscriptions.cancel') && canAct ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setReason('');
                  setActionError(null);
                  setCancelOpen(true);
                }}
              >
                <Ban className="size-4" aria-hidden />
                {t('cancelSub')}
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3">
          <StatusBadge value={s.status} />
          {s.effectivelyExpired && s.status !== 'CANCELLED' ? (
            <Badge label={t('effectivelyExpired')} tone="destructive" />
          ) : null}
          <Badge label={s.subscriptionTypeName} tone="accent" />
          {s.groupName ? <Badge label={s.groupName} /> : null}
          {s.suspendStart ? (
            <span className="text-xs text-muted-foreground">
              {t('suspend')}: {fmt.date(s.suspendStart)} → {s.suspendEnd ? fmt.date(s.suspendEnd) : '…'}
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
                <Link href={`/athletes/${s.athleteId}`} className="text-primary hover:underline">
                  {s.athleteName} <span className="ltr-field font-mono text-xs">{s.registrationNo}</span>
                </Link>
              }
            />
            <InfoRow label={t('subscriptionType')} value={s.subscriptionTypeName} />
            <InfoRow label={t('kind')} value={t(`kinds.${s.subscriptionTypeKind}`)} />
            <InfoRow label={t('group')} value={s.groupName ?? tc('none')} />
            <InfoRow label={t('startDate')} value={fmt.date(s.startDate)} />
            <InfoRow label={t('endDate')} value={fmt.date(s.endDate)} />
            <InfoRow label={t('dueDate')} value={fmt.date(s.dueDate)} />
            {s.sessionsTotal !== null ? (
              <InfoRow label={t('sessionsTotal')} value={`${fmt.number(s.sessionsUsed)} / ${fmt.number(s.sessionsTotal)}`} />
            ) : null}
            {s.cancelReason ? <InfoRow label={t('cancelReason')} value={s.cancelReason} /> : null}
            {s.suspendReason ? <InfoRow label={t('suspendReason')} value={s.suspendReason} /> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('netAmount')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label={t('price')} value={<span className="tabular-nums">{fmt.money(s.price)}</span>} />
            {s.discountKind ? (
              <InfoRow
                label={`${t('discount')} (${t(s.discountKind)})`}
                value={
                  <span className="tabular-nums text-warning">
                    −{fmt.money(s.discountAmount)}
                    {s.discountReason ? <span className="ms-1 text-xs text-muted-foreground">({s.discountReason})</span> : null}
                  </span>
                }
              />
            ) : null}
            <InfoRow label={t('netAmount')} value={<span className="tabular-nums font-bold">{fmt.money(s.netAmount)}</span>} />
            <InfoRow label={t('paidAmount')} value={<span className="tabular-nums text-success">{fmt.money(s.paidAmount)}</span>} />
            <InfoRow
              label={t('remaining')}
              value={
                <span className={s.remainingAmount !== '0' ? 'tabular-nums font-bold text-destructive' : 'tabular-nums'}>
                  {fmt.money(s.remainingAmount)}
                </span>
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* تجديد */}
      <ConfirmDialog
        open={renewOpen}
        onOpenChange={(o) => !pending && setRenewOpen(o)}
        title={t('renew')}
        message={
          <span>
            {t('renewConfirm')}
            {actionError ? <ErrorText message={actionError} /> : null}
          </span>
        }
        tone="primary"
        confirmLabel={t('renew')}
        loading={renewMutation.pending}
        onConfirm={() => void doRenew()}
      />

      {/* تعليق — سبب إلزامي */}
      <Modal
        open={suspendOpen}
        onOpenChange={(o) => !pending && setSuspendOpen(o)}
        title={t('suspend')}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSuspendOpen(false)} disabled={pending}>
              {tc('cancel')}
            </Button>
            <Button type="button" onClick={() => void doSuspend()} loading={suspendMutation.pending} disabled={reason.trim().length < 5}>
              {t('suspend')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {actionError ? <ErrorText message={actionError} /> : null}
          <Field label={t('suspendReason')} htmlFor="sub-reason" required>
            <Textarea id="sub-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label={t('suspendEnd')} htmlFor="sub-send">
            <DatePicker id="sub-send" value={suspendEnd} min={todayFor(settings)} onChange={(e) => setSuspendEnd(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* استئناف */}
      <ConfirmDialog
        open={resumeOpen}
        onOpenChange={(o) => !pending && setResumeOpen(o)}
        title={t('resume')}
        message={
          <span>
            {t('resumeConfirm')}
            {actionError ? <ErrorText message={actionError} /> : null}
          </span>
        }
        tone="primary"
        confirmLabel={t('resume')}
        loading={resumeMutation.pending}
        onConfirm={() => void doResume()}
      />

      {/* إلغاء — سبب إلزامي */}
      <Modal
        open={cancelOpen}
        onOpenChange={(o) => !pending && setCancelOpen(o)}
        title={t('cancelSub')}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={pending}>
              {tc('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void doCancel()}
              loading={cancelMutation.pending}
              disabled={reason.trim().length < 5}
            >
              {t('cancelSub')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {actionError ? <ErrorText message={actionError} /> : null}
          <Field label={t('cancelReason')} htmlFor="sub-creason" required>
            <Textarea id="sub-creason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
