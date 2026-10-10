'use client';

/**
 * دفعة جديدة — اختيار رياضي ثم اشتراكه، رفض الدفع الزائد في العميل (حسب الإعداد)،
 * Idempotency-Key عند الإرسال، وتعطيل الزر أثناء الحفظ (منع الإرسال المزدوج).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiClientError, apiGet, newIdempotencyKey } from '@/shared/api/client';
import type { AthleteDto, PaymentCreateResult, PaymentMethodDto, SubscriptionDto } from '@/shared/api/types';
import { useApi, useErrorText, useMutation, makeApiMutation } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { todayFor } from '@/shared/lib/format';
import { toMinorUnits } from '@/shared/money';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select } from '@/shared/ui-kit/select';
import { Textarea } from '@/shared/ui-kit/textarea';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { SearchInput } from '@/shared/ui-kit/search';
import { Field, ErrorText, FormActions, FormGrid } from '@/shared/ui-kit/form';
import { Loading } from '@/shared/ui-kit/loading';
import { useToast } from '@/shared/ui-kit/toast';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

export function PaymentForm() {
  const t = useTranslations('payment');
  const tc = useTranslations('common');
  const tsub = useTranslations('subscription');
  const tv = useTranslations('ui.validation');
  const toast = useToast();
  const errorText = useErrorText();
  const router = useRouter();
  const fmt = useFormatters();
  const { settings } = useSession();
  const searchParams = useSearchParams();

  const preselectedAthleteId = searchParams.get('athleteId') ?? '';
  const preselectedSubscriptionId = searchParams.get('subscriptionId') ?? '';

  const methods = useApi<PaymentMethodDto[]>('/payment-methods');

  const [athlete, setAthlete] = useState<AthleteDto | null>(null);
  const [athleteQuery, setAthleteQuery] = useState('');
  const [athleteResults, setAthleteResults] = useState<AthleteDto[]>([]);
  const [searchingAthletes, setSearchingAthletes] = useState(false);
  const [athleteError, setAthleteError] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState('');
  const [subscriptions, setSubscriptions] = useState<SubscriptionDto[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        amount: z
          .string()
          .regex(MONEY_RE, tv('positive'))
          .refine((v) => Number(v) > 0, tv('positive')),
        discount: z.string(),
        paymentMethodId: z.string().min(1, tv('required')),
        paymentDate: z.string().regex(DATE_RE, tv('required')),
        notes: z.string(),
      }),
    [tv],
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      amount: '',
      discount: '',
      paymentMethodId: '',
      paymentDate: todayFor(settings),
      notes: '',
    },
  });

  // تعبئة مسبقة من رابط اشتراك (مثل زر "دفع" في تفاصيل الاشتراك)
  useEffect(() => {
    if (!preselectedAthleteId || athlete) return;
    let cancelled = false;
    apiGet<AthleteDto>(`/athletes/${preselectedAthleteId}`)
      .then((r) => {
        if (!cancelled) setAthlete(r.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedAthleteId]);

  useEffect(() => {
    if (preselectedSubscriptionId && subscriptions.length > 0 && subscriptionId === '') {
      setSubscriptionId(preselectedSubscriptionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedSubscriptionId, subscriptions]);

  // تحميل اشتراكات الرياضي عند اختياره
  useEffect(() => {
    if (!athlete) {
      setSubscriptions([]);
      return;
    }
    let cancelled = false;
    setLoadingSubs(true);
    apiGet<SubscriptionDto[]>('/subscriptions', { athleteId: athlete.id, pageSize: 50 })
      .then((r) => {
        if (cancelled) return;
        const open = r.data.filter((s) => s.status !== 'CANCELLED');
        setSubscriptions(open);
        if (preselectedSubscriptionId && open.some((s) => s.id === preselectedSubscriptionId)) {
          setSubscriptionId(preselectedSubscriptionId);
        } else if (open.length === 1) {
          setSubscriptionId(open[0]!.id);
        }
      })
      .catch(() => !cancelled && setSubscriptions([]))
      .finally(() => !cancelled && setLoadingSubs(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athlete]);

  const selectedSub = subscriptions.find((s) => s.id === subscriptionId) ?? null;

  // ضبط المبلغ الافتراضي = المتبقي عند اختيار الاشتراك
  useEffect(() => {
    if (selectedSub && form.getValues('amount') === '') {
      const remaining = BigInt(selectedSub.remainingAmount);
      if (remaining > 0n) {
        form.setValue('amount', decimalFromMinor(remaining, settings.currencyDecimals));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSub]);

  const searchAthletes = async (q: string) => {
    setAthleteQuery(q);
    if (q.trim().length < 2) {
      setAthleteResults([]);
      return;
    }
    setSearchingAthletes(true);
    try {
      const r = await apiGet<AthleteDto[]>('/athletes', { q, pageSize: 8 });
      setAthleteResults(r.data);
    } catch {
      setAthleteResults([]);
    } finally {
      setSearchingAthletes(false);
    }
  };

  const paymentMutation = useMutation(
    makeApiMutation<Record<string, unknown>, PaymentCreateResult>(() => '/payments', 'POST'),
  );

  const submit = async (values: Values) => {
    setSubmitError(null);
    setAthleteError(null);
    if (!athlete) {
      setAthleteError(tv('required'));
      return;
    }
    if (!selectedSub) {
      setSubmitError(t('selectSubscription'));
      return;
    }
    const decimals = settings.currencyDecimals;
    const amountMinor = toMinorUnits(values.amount, decimals);
    const discountMinor = values.discount !== '' && MONEY_RE.test(values.discount) ? toMinorUnits(values.discount, decimals) : 0n;
    const netMinor = amountMinor - discountMinor;
    const remainingMinor = BigInt(selectedSub.remainingAmount);
    // رفض الدفع الزائد في العميل ما لم يسمح به الإعداد
    if (!settings.allowOverpay && netMinor > remainingMinor) {
      form.setError('amount', {
        message: t('overpayRejected', { amount: fmt.money(netMinor.toString()), remaining: fmt.money(remainingMinor.toString()) }),
      });
      return;
    }
    if (netMinor <= 0n) {
      form.setError('amount', { message: tv('positive') });
      return;
    }
    const body: Record<string, unknown> = {
      athleteId: athlete.id,
      subscriptionId: selectedSub.id,
      amount: values.amount,
      discount: values.discount !== '' ? values.discount : undefined,
      paymentMethodId: values.paymentMethodId,
      paymentDate: values.paymentDate,
      notes: values.notes || undefined,
    };
    const result = await paymentMutation.mutate(body, { idempotencyKey: newIdempotencyKey() });
    if (result) {
      if (result.replayed) toast.info(t('replayed'));
      toast.success(t('paymentSuccess', { receiptNo: result.receiptNo }));
      router.push(`/payments/${result.payment.id}`);
    } else if (paymentMutation.error) {
      const e = paymentMutation.error;
      if (e instanceof ApiClientError && e.fieldErrors) {
        for (const [key, msgs] of Object.entries(e.fieldErrors)) {
          form.setError(key as never, { message: msgs[0] });
        }
      } else {
        setSubmitError(errorText(e));
      }
    }
  };

  return (
    <div>
      <PageHeader title={t('newPayment')} backHref="/payments" backLabel={tc('back')} />

      <form onSubmit={form.handleSubmit((v) => void submit(v))} noValidate>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">{t('selectAthlete')}</CardTitle>
          </CardHeader>
          <CardContent>
            {athleteError ? (
              <div className="mb-2">
                <ErrorText message={athleteError} />
              </div>
            ) : null}
            {athlete ? (
              <div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <span>
                  <span className="font-medium">
                    {athlete.firstName} {athlete.lastName}
                  </span>
                  <span className="ltr-field ms-2 font-mono text-xs text-muted-foreground">{athlete.registrationNo}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={paymentMutation.pending}
                  onClick={() => {
                    setAthlete(null);
                    setSubscriptionId('');
                  }}
                >
                  {tc('clear')}
                </Button>
              </div>
            ) : (
              <div>
                <SearchInput
                  value={athleteQuery}
                  onSearch={(q) => void searchAthletes(q)}
                  placeholder={t('selectAthlete') + '…'}
                />
                {searchingAthletes ? <Loading label={tc('loading')} /> : null}
                {athleteResults.length > 0 ? (
                  <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
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
                            setAthlete(a);
                            setAthleteError(null);
                          }}
                        >
                          {tc('add')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">{t('title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {submitError ? (
              <div className="mb-3">
                <ErrorText message={submitError} />
              </div>
            ) : null}
            {loadingSubs ? <Loading label={tc('loading')} /> : null}
            <FormGrid>
              <Field label={t('selectSubscription')} htmlFor="p-sub" required className="sm:col-span-2">
                <Select
                  id="p-sub"
                  value={subscriptionId}
                  onChange={(e) => setSubscriptionId(e.target.value)}
                  placeholder={tc('none')}
                  disabled={!athlete || loadingSubs}
                  options={subscriptions.map((s) => ({
                    value: s.id,
                    label: `${s.subscriptionTypeName} · ${fmt.date(s.startDate)} → ${fmt.date(s.endDate)} · ${tsub('remaining')}: ${fmt.money(s.remainingAmount)}`,
                  }))}
                />
              </Field>
              {selectedSub ? (
                <div className="sm:col-span-2 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{tsub('netAmount')}</p>
                    <p className="text-sm font-bold tabular-nums">{fmt.money(selectedSub.netAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{tsub('paidAmount')}</p>
                    <p className="text-sm font-bold tabular-nums text-success">{fmt.money(selectedSub.paidAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('subscriptionRemaining')}</p>
                    <p className="text-sm font-bold tabular-nums text-destructive">{fmt.money(selectedSub.remainingAmount)}</p>
                  </div>
                </div>
              ) : null}
              <Field label={t('amount')} htmlFor="p-amount" required error={form.formState.errors.amount?.message}>
                <Input
                  id="p-amount"
                  type="text"
                  inputMode="decimal"
                  ltr
                  {...form.register('amount')}
                  invalid={Boolean(form.formState.errors.amount)}
                />
              </Field>
              <Field label={t('discount')} htmlFor="p-discount" error={form.formState.errors.discount?.message}>
                <Input
                  id="p-discount"
                  type="text"
                  inputMode="decimal"
                  ltr
                  {...form.register('discount')}
                  invalid={Boolean(form.formState.errors.discount)}
                />
              </Field>
              <Field
                label={t('method')}
                htmlFor="p-method"
                required
                error={form.formState.errors.paymentMethodId?.message}
              >
                <Select
                  id="p-method"
                  {...form.register('paymentMethodId')}
                  placeholder={tc('none')}
                  options={(methods.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
                  invalid={Boolean(form.formState.errors.paymentMethodId)}
                />
              </Field>
              <Field label={t('paymentDate')} htmlFor="p-date" required error={form.formState.errors.paymentDate?.message}>
                <DatePicker
                  id="p-date"
                  {...form.register('paymentDate')}
                  invalid={Boolean(form.formState.errors.paymentDate)}
                />
              </Field>
              <Field label={tc('notes')} htmlFor="p-notes" className="sm:col-span-2">
                <Textarea id="p-notes" {...form.register('notes')} />
              </Field>
            </FormGrid>
          </CardContent>
        </Card>

        <FormActions>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={paymentMutation.pending}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={paymentMutation.pending}>
            {tc('save')}
          </Button>
        </FormActions>
      </form>
    </div>
  );
}

/** مبلغ بأصغر وحدة (BigInt) → نص عشري للحقول. */
function decimalFromMinor(minor: bigint, decimals: number): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const factor = 10n ** BigInt(decimals);
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(decimals, '0');
  return `${neg ? '-' : ''}${decimals > 0 ? `${intPart}.${fracPart}` : `${intPart}`}`;
}
