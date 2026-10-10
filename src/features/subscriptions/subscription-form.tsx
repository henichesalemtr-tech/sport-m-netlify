'use client';

/**
 * نموذج الاشتراك (إنشاء/تعديل) — خصم بسبب إلزامي (بالصلاحية)،
 * وحساب حي للصافي/المتبقي عبر دوال المال المشتركة (BigInt — ممنوع float).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiClientError, apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { AthleteDto, GroupDto, SportDto, SubscriptionDto, SubscriptionTypeDto } from '@/shared/api/types';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { minorToDecimal, todayFor } from '@/shared/lib/format';
import { toMinorUnits, applyDiscount, type MinorUnits } from '@/shared/money';
import { addDays, parseDateOnly } from '@/shared/dates';
import { DISCOUNT_KINDS } from '@/shared/lib/options';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select } from '@/shared/ui-kit/select';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { SearchInput } from '@/shared/ui-kit/search';
import { Field, ErrorText, FormActions, FormGrid } from '@/shared/ui-kit/form';
import { Loading } from '@/shared/ui-kit/loading';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { useToast } from '@/shared/ui-kit/toast';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;

export function SubscriptionForm({ subscriptionId }: { subscriptionId?: string }) {
  const t = useTranslations('subscription');
  const tc = useTranslations('common');
  const tv = useTranslations('ui.validation');
  const toast = useToast();
  const errorText = useErrorText();
  const router = useRouter();
  const fmt = useFormatters();
  const { can, settings } = useSession();
  const isEdit = Boolean(subscriptionId);

  const existing = useApi<SubscriptionDto>(isEdit ? `/subscriptions/${subscriptionId}` : null);
  const types = useApi<SubscriptionTypeDto[]>('/subscription-types', { params: { pageSize: 100 } });
  const sports = useApi<SportDto[]>('/sports', { params: { pageSize: 100 } });
  const groups = useApi<GroupDto[]>('/groups', { params: { pageSize: 100 } });

  const [athlete, setAthlete] = useState<AthleteDto | null>(null);
  const [athleteQuery, setAthleteQuery] = useState('');
  const [athleteResults, setAthleteResults] = useState<AthleteDto[]>([]);
  const [searchingAthletes, setSearchingAthletes] = useState(false);
  const [athleteError, setAthleteError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const schema = useMemo(
    () =>
      z
        .object({
          subscriptionTypeId: z.string().min(1, tv('required')),
          sportId: z.string(),
          groupId: z.string(),
          startDate: z.string().regex(DATE_RE, tv('required')),
          endDate: z.string(),
          dueDate: z.string(),
          price: z.string(),
          discountKind: z.string(),
          discountValue: z.string(),
          discountReason: z.string(),
          sessionsTotal: z.string(),
        })
        .superRefine((val, ctx) => {
          if (val.endDate !== '' && !DATE_RE.test(val.endDate)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: tv('required') });
          }
          if (val.endDate !== '' && val.startDate !== '' && val.endDate <= val.startDate) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: tv('endTimeAfterStart') });
          }
          if (val.dueDate !== '' && !DATE_RE.test(val.dueDate)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: tv('required') });
          }
          if (val.price !== '' && !MONEY_RE.test(val.price)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['price'], message: tv('positive') });
          }
          if (val.discountKind !== '' && val.discountValue !== '') {
            if (val.discountKind === 'FIXED' && !MONEY_RE.test(val.discountValue)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: tv('positive') });
            }
            if (val.discountKind === 'PERCENT' && (!PERCENT_RE.test(val.discountValue) || Number(val.discountValue) > 100 || Number(val.discountValue) <= 0)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: tv('positive') });
            }
            if (Number(val.discountValue) > 0 && val.discountReason.trim().length < 5) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['discountReason'],
                message: tv('minLength', { min: 5 }),
              });
            }
          }
          if (val.sessionsTotal !== '' && !/^\d+$/.test(val.sessionsTotal)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sessionsTotal'], message: tv('integer') });
          }
        }),
    [tv],
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      subscriptionTypeId: '',
      sportId: '',
      groupId: '',
      startDate: todayFor(settings),
      endDate: '',
      dueDate: '',
      price: '',
      discountKind: '',
      discountValue: '',
      discountReason: '',
      sessionsTotal: '',
    },
  });

  const watched = form.watch();
  const selectedType = (types.data ?? []).find((x) => x.id === watched.subscriptionTypeId);
  const priceEditable = !isEdit && selectedType ? selectedType.allowPriceEdit : true;
  const isSessionsKind = selectedType?.kind === 'SESSIONS' || selectedType?.kind === 'CUSTOM';

  // اختيار النوع: تعبئة السعر الافتراضي واقتراح تاريخ النهاية حسب المدة
  const onTypeChange = (typeId: string) => {
    form.setValue('subscriptionTypeId', typeId, { shouldDirty: true, shouldValidate: true });
    const type = (types.data ?? []).find((x) => x.id === typeId);
    if (!type) return;
    if (type.allowPriceEdit || !isEdit) {
      form.setValue('price', minorToDecimal(type.defaultPrice, settings.currencyDecimals));
    }
    if (type.durationDays) {
      const start = form.getValues('startDate');
      if (DATE_RE.test(start)) {
        const end = addDays(parseDateOnly(start), type.durationDays - 1);
        form.setValue('endDate', end.toISOString().slice(0, 10));
      }
    }
    if (type.sessionsTotal) form.setValue('sessionsTotal', String(type.sessionsTotal));
  };

  useEffect(() => {
    if (!existing.data) return;
    const s = existing.data;
    form.reset({
      subscriptionTypeId: s.subscriptionTypeId,
      sportId: s.sportId ?? '',
      groupId: s.groupId ?? '',
      startDate: s.startDate.slice(0, 10),
      endDate: s.endDate.slice(0, 10),
      dueDate: s.dueDate.slice(0, 10),
      price: minorToDecimal(s.price, settings.currencyDecimals),
      discountKind: s.discountKind ?? '',
      discountValue: s.discountValue ? minorToDecimal(s.discountValue, s.discountKind === 'PERCENT' ? 2 : settings.currencyDecimals) : '',
      discountReason: s.discountReason ?? '',
      sessionsTotal: s.sessionsTotal !== null ? String(s.sessionsTotal) : '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

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

  // الحساب الحي: الصافي = السعر − الخصم (BigInt عبر shared/money)
  const live = useMemo(() => {
    const decimals = settings.currencyDecimals;
    const priceStr =
      watched.price !== '' ? watched.price : selectedType ? minorToDecimal(selectedType.defaultPrice, decimals) : '';
    if (!MONEY_RE.test(priceStr)) return null;
    const priceMinor = toMinorUnits(priceStr, decimals);
    let discountInput: { kind: 'FIXED' | 'PERCENT'; value: MinorUnits } | null = null;
    if (watched.discountKind === 'FIXED' && MONEY_RE.test(watched.discountValue)) {
      discountInput = { kind: 'FIXED', value: toMinorUnits(watched.discountValue, decimals) };
    } else if (watched.discountKind === 'PERCENT' && PERCENT_RE.test(watched.discountValue)) {
      discountInput = { kind: 'PERCENT', value: toMinorUnits(watched.discountValue, 2) };
    }
    const { discountAmount, net } = applyDiscount(priceMinor, discountInput);
    const paid = existing.data ? BigInt(existing.data.paidAmount) : 0n;
    return { priceMinor, discountAmount, net, remaining: net - paid };
  }, [
    watched.price,
    watched.discountKind,
    watched.discountValue,
    selectedType,
    settings.currencyDecimals,
    existing.data,
  ]);

  const canDiscount = can('subscriptions.apply_discount');

  const submit = async (values: Values) => {
    setSubmitError(null);
    if (!isEdit && !athlete) {
      setAthleteError(tv('required'));
      return;
    }
    const discountValuePositive =
      values.discountKind !== '' && values.discountValue !== '' && Number(values.discountValue) > 0;
    const body: Record<string, unknown> = {
      sportId: values.sportId || null,
      groupId: values.groupId || null,
      startDate: values.startDate,
      endDate: values.endDate || undefined,
      dueDate: values.dueDate || undefined,
      price: values.price || undefined,
      discount: discountValuePositive
        ? { kind: values.discountKind, value: values.discountValue, reason: values.discountReason.trim() }
        : isEdit
          ? null
          : undefined,
      sessionsTotal: values.sessionsTotal !== '' ? Number(values.sessionsTotal) : null,
    };
    if (!isEdit && athlete) {
      body.athleteId = athlete.id;
      body.subscriptionTypeId = values.subscriptionTypeId;
    }
    if (isEdit && existing.data) body.version = existing.data.version;
    setSubmitting(true);
    try {
      if (isEdit && existing.data) {
        await apiPatch(`/subscriptions/${existing.data.id}`, body);
        toast.success(t('editSubscription'));
        router.push(`/subscriptions/${existing.data.id}`);
      } else {
        const r = await apiPost<SubscriptionDto>('/subscriptions', body);
        toast.success(t('newSubscription'));
        router.push(`/subscriptions/${r.data.id}`);
      }
    } catch (e) {
      if (e instanceof ApiClientError && e.fieldErrors) {
        for (const [key, msgs] of Object.entries(e.fieldErrors)) {
          form.setError(key as never, { message: msgs[0] });
        }
      } else {
        setSubmitError(errorText(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isEdit && existing.loading) return <Loading label={tc('loading')} />;
  if (isEdit && existing.error) return <ErrorState message={errorText(existing.error)} onRetry={existing.reload} />;

  return (
    <div>
      <PageHeader
        title={isEdit ? t('editSubscription') : t('newSubscription')}
        backHref="/subscriptions"
        backLabel={tc('back')}
      />

      <form onSubmit={form.handleSubmit((v) => void submit(v))} noValidate>
        {!isEdit ? (
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
                    <span className="ltr-field ms-2 font-mono text-xs text-muted-foreground">
                      {athlete.registrationNo}
                    </span>
                  </span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAthlete(null)}>
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
                            <span className="ltr-field ms-2 font-mono text-xs text-muted-foreground">
                              {a.registrationNo}
                            </span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAthlete(a);
                              setAthleteError(null);
                              if (!form.getValues('sportId') && a.sportId) form.setValue('sportId', a.sportId);
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
        ) : null}

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
            {isEdit && existing.data ? (
              <p className="mb-3 text-sm text-muted-foreground">
                {existing.data.athleteName}{' '}
                <span className="ltr-field font-mono text-xs">{existing.data.registrationNo}</span>
              </p>
            ) : null}
            <FormGrid>
              <Field
                label={t('subscriptionType')}
                htmlFor="s-type"
                required
                error={form.formState.errors.subscriptionTypeId?.message}
              >
                <Select
                  id="s-type"
                  value={form.watch('subscriptionTypeId')}
                  onChange={(e) => onTypeChange(e.target.value)}
                  placeholder={tc('none')}
                  options={(types.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                  invalid={Boolean(form.formState.errors.subscriptionTypeId)}
                  disabled={isEdit}
                />
              </Field>
              <Field label={t('sport')} htmlFor="s-sport">
                <Select
                  id="s-sport"
                  {...form.register('sportId')}
                  placeholder={tc('none')}
                  options={(sports.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
              <Field label={t('group')} htmlFor="s-group">
                <Select
                  id="s-group"
                  {...form.register('groupId')}
                  placeholder={tc('none')}
                  options={(groups.data ?? []).map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))}
                />
              </Field>
              {isSessionsKind || form.watch('sessionsTotal') !== '' ? (
                <Field label={t('sessionsTotal')} htmlFor="s-sessions" error={form.formState.errors.sessionsTotal?.message}>
                  <Input
                    id="s-sessions"
                    type="text"
                    inputMode="numeric"
                    ltr
                    {...form.register('sessionsTotal')}
                    invalid={Boolean(form.formState.errors.sessionsTotal)}
                  />
                </Field>
              ) : null}
              <Field label={t('startDate')} htmlFor="s-start" required error={form.formState.errors.startDate?.message}>
                <DatePicker
                  id="s-start"
                  {...form.register('startDate')}
                  invalid={Boolean(form.formState.errors.startDate)}
                />
              </Field>
              <Field label={t('endDate')} htmlFor="s-end" error={form.formState.errors.endDate?.message}>
                <DatePicker id="s-end" {...form.register('endDate')} invalid={Boolean(form.formState.errors.endDate)} />
              </Field>
              <Field label={t('dueDate')} htmlFor="s-due" error={form.formState.errors.dueDate?.message}>
                <DatePicker id="s-due" {...form.register('dueDate')} invalid={Boolean(form.formState.errors.dueDate)} />
              </Field>
              <Field label={t('price')} htmlFor="s-price" error={form.formState.errors.price?.message}>
                <Input
                  id="s-price"
                  type="text"
                  inputMode="decimal"
                  ltr
                  disabled={!priceEditable}
                  {...form.register('price')}
                  invalid={Boolean(form.formState.errors.price)}
                />
              </Field>
            </FormGrid>

            {canDiscount ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label={t('discountKind')} htmlFor="s-dkind">
                  <Select
                    id="s-dkind"
                    {...form.register('discountKind')}
                    placeholder={tc('none')}
                    options={DISCOUNT_KINDS.map((k) => ({ value: k, label: t(k) }))}
                  />
                </Field>
                <Field label={t('discountValue')} htmlFor="s-dvalue" error={form.formState.errors.discountValue?.message}>
                  <Input
                    id="s-dvalue"
                    type="text"
                    inputMode="decimal"
                    ltr
                    disabled={form.watch('discountKind') === ''}
                    {...form.register('discountValue')}
                    invalid={Boolean(form.formState.errors.discountValue)}
                  />
                </Field>
                <Field
                  label={t('discountReason')}
                  htmlFor="s-dreason"
                  required={form.watch('discountKind') !== '' && Number(form.watch('discountValue') || 0) > 0}
                  error={form.formState.errors.discountReason?.message}
                >
                  <Input
                    id="s-dreason"
                    disabled={form.watch('discountKind') === ''}
                    {...form.register('discountReason')}
                    invalid={Boolean(form.formState.errors.discountReason)}
                  />
                </Field>
              </div>
            ) : null}

            {live ? (
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t('price')}</p>
                  <p className="text-sm font-bold tabular-nums">{fmt.money(live.priceMinor.toString())}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('discount')}</p>
                  <p className="text-sm font-bold tabular-nums text-warning">{fmt.money(live.discountAmount.toString())}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('netAmount')}</p>
                  <p className="text-sm font-bold tabular-nums text-primary">{fmt.money(live.net.toString())}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('remaining')}</p>
                  <p className="text-sm font-bold tabular-nums text-destructive">{fmt.money(live.remaining.toString())}</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <FormActions>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={submitting}>
            {tc('save')}
          </Button>
        </FormActions>
      </form>
    </div>
  );
}
