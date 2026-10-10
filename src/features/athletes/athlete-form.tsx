'use client';

/**
 * نموذج الرياضي (إنشاء/تعديل) — حقول حساسة مبوبة بالصلاحية، فحص تكرار،
 * ربط أولياء، واقتراح الفئة العمرية من تاريخ الميلاد.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sparkles, UserPlus, X } from 'lucide-react';
import { ApiClientError, apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type {
  AgeCategoryDto,
  AthleteDto,
  AthleteDuplicateMatch,
  ParentDto,
  SportDto,
} from '@/shared/api/types';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { todayFor } from '@/shared/lib/format';
import { ATHLETE_STATUSES, BLOOD_TYPES, GENDERS } from '@/shared/lib/options';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select } from '@/shared/ui-kit/select';
import { Textarea } from '@/shared/ui-kit/textarea';
import { Checkbox, DatePicker } from '@/shared/ui-kit/date-picker';
import { SearchInput } from '@/shared/ui-kit/search';
import { Field, ErrorText, FormGrid, FormActions } from '@/shared/ui-kit/form';
import { Loading } from '@/shared/ui-kit/loading';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { useToast } from '@/shared/ui-kit/toast';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RE = /^[+\d][\d\s()-]{5,19}$/;

interface ParentLink {
  parentId: string;
  label: string;
  relationship: string;
  isPrimary: boolean;
  isPayer: boolean;
  isEmergency: boolean;
}

export function AthleteForm({ athleteId }: { athleteId?: string }) {
  const t = useTranslations('athlete');
  const tc = useTranslations('common');
  const ts = useTranslations('status');
  const tt = useTranslations();
  const tv = useTranslations('ui.validation');
  const toast = useToast();
  const errorText = useErrorText();
  const router = useRouter();
  const fmt = useFormatters();
  const { can, settings } = useSession();
  const isEdit = Boolean(athleteId);

  const existing = useApi<AthleteDto>(isEdit ? `/athletes/${athleteId}` : null);
  const sports = useApi<SportDto[]>('/sports', { params: { pageSize: 100 } });
  const categories = useApi<AgeCategoryDto[]>('/age-categories', { params: { pageSize: 100 } });

  const [parentLinks, setParentLinks] = useState<ParentLink[]>([]);
  const [parentQuery, setParentQuery] = useState('');
  const [parentResults, setParentResults] = useState<ParentDto[]>([]);
  const [searchingParents, setSearchingParents] = useState(false);
  const [duplicates, setDuplicates] = useState<AthleteDuplicateMatch[] | null>(null);
  const [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        firstName: z.string().min(2, tv('minLength', { min: 2 })),
        lastName: z.string().min(2, tv('minLength', { min: 2 })),
        gender: z.enum(['MALE', 'FEMALE']),
        birthDate: z.string().regex(DATE_RE, tv('required')),
        phone: z.string().refine((v) => v === '' || PHONE_RE.test(v), tv('phone')),
        email: z.string().refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), tv('email')),
        address: z.string(),
        sportId: z.string(),
        ageCategoryId: z.string(),
        registrationDate: z.string().regex(DATE_RE, tv('required')),
        status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'WITHDRAWN', 'BLOCKED']),
        notes: z.string(),
        additionalInfo: z.string(),
        emergencyName: z.string(),
        emergencyPhone: z.string().refine((v) => v === '' || PHONE_RE.test(v), tv('phone')),
        imageConsent: z.boolean(),
        medicalNotes: z.string(),
        bloodType: z.string(),
        allergies: z.string(),
      }),
    [tv],
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: 'MALE',
      birthDate: '',
      phone: '',
      email: '',
      address: '',
      sportId: '',
      ageCategoryId: '',
      registrationDate: todayFor(settings),
      status: 'ACTIVE',
      notes: '',
      additionalInfo: '',
      emergencyName: '',
      emergencyPhone: '',
      imageConsent: false,
      medicalNotes: '',
      bloodType: '',
      allergies: '',
    },
  });

  // تعبئة النموذج في وضع التعديل
  useEffect(() => {
    if (!existing.data) return;
    const a = existing.data;
    form.reset({
      firstName: a.firstName,
      lastName: a.lastName,
      gender: a.gender,
      birthDate: a.birthDate.slice(0, 10),
      phone: a.phone ?? '',
      email: a.email ?? '',
      address: a.address ?? '',
      sportId: a.sportId ?? '',
      ageCategoryId: a.ageCategoryId ?? '',
      registrationDate: a.registrationDate.slice(0, 10),
      status: a.status,
      notes: a.notes ?? '',
      additionalInfo: a.additionalInfo ?? '',
      emergencyName: a.emergencyName ?? '',
      emergencyPhone: a.emergencyPhone ?? '',
      imageConsent: a.imageConsent,
      medicalNotes: a.medicalNotes ?? '',
      bloodType: a.bloodType ?? '',
      allergies: a.allergies ?? '',
    });
    setParentLinks(
      a.parents.map((p) => ({
        parentId: p.parent.id,
        label: `${p.parent.firstName} ${p.parent.lastName} (${p.parent.phone})`,
        relationship: p.relationship ?? '',
        isPrimary: p.isPrimary,
        isPayer: p.isPayer,
        isEmergency: p.isEmergency,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const searchParents = async (q: string) => {
    setParentQuery(q);
    if (q.trim().length < 2) {
      setParentResults([]);
      return;
    }
    setSearchingParents(true);
    try {
      const r = await apiGet<ParentDto[]>('/parents', { q, pageSize: 8 });
      setParentResults(r.data);
    } catch {
      setParentResults([]);
    } finally {
      setSearchingParents(false);
    }
  };

  const suggestCategory = async () => {
    const birthDate = form.getValues('birthDate');
    if (!DATE_RE.test(birthDate)) {
      form.setError('birthDate', { message: tv('required') });
      return;
    }
    try {
      const r = await apiGet<AgeCategoryDto | null>('/age-categories/suggest', { birthDate });
      if (r.data) form.setValue('ageCategoryId', r.data.id);
      else toast.info(tc('noData'));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const buildBody = (values: Values, overrideDuplicate: boolean): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      gender: values.gender,
      birthDate: values.birthDate,
      phone: values.phone || undefined,
      email: values.email || undefined,
      address: values.address || undefined,
      sportId: values.sportId || null,
      ageCategoryId: values.ageCategoryId || null,
      registrationDate: values.registrationDate,
      status: values.status,
      notes: values.notes || undefined,
      additionalInfo: values.additionalInfo || undefined,
      emergencyName: values.emergencyName || undefined,
      emergencyPhone: values.emergencyPhone || undefined,
      imageConsent: values.imageConsent,
      parents: parentLinks.map((p) => ({
        parentId: p.parentId,
        relationship: p.relationship || undefined,
        isPrimary: p.isPrimary,
        isPayer: p.isPayer,
        isEmergency: p.isEmergency,
      })),
    };
    if (can('athletes.view_sensitive')) {
      body.medicalNotes = values.medicalNotes || null;
      body.bloodType = values.bloodType || null;
      body.allergies = values.allergies || null;
    }
    if (!isEdit && overrideDuplicate) body.overrideDuplicate = true;
    if (isEdit && existing.data) body.version = existing.data.version;
    return body;
  };

  const submit = async (values: Values) => {
    setSubmitError(null);
    // فحص التكرار قبل الإنشاء
    if (!isEdit) {
      try {
        const dup = await apiGet<AthleteDuplicateMatch[]>('/athletes/duplicates', {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          birthDate: values.birthDate,
          phone: values.phone || undefined,
        });
        if (dup.data.length > 0) {
          setDuplicates(dup.data);
          setPendingBody(buildBody(values, false));
          return; // بانتظار تأكيد المستخدم
        }
      } catch {
        // فشل الفحص لا يمنع المتابعة
      }
    }
    await send(buildBody(values, false));
  };

  const send = async (body: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      if (isEdit && existing.data) {
        await apiPatch(`/athletes/${existing.data.id}`, body);
        toast.success(t('editAthlete'));
        router.push(`/athletes/${existing.data.id}`);
      } else {
        const r = await apiPost<AthleteDto>('/athletes', body);
        toast.success(t('createSuccess', { name: `${r.data.firstName} ${r.data.lastName}`, reg: r.data.registrationNo }));
        router.push(`/athletes/${r.data.id}`);
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
      setPendingBody(null);
      setDuplicates(null);
    }
  };

  if (isEdit && existing.loading) return <Loading label={tc('loading')} />;
  if (isEdit && existing.error) return <ErrorState message={errorText(existing.error)} onRetry={existing.reload} />;

  const sensitive = can('athletes.view_sensitive');

  return (
    <div>
      <PageHeader
        title={isEdit ? t('editAthlete') : t('newAthlete')}
        backHref="/athletes"
        backLabel={tc('back')}
      />

      <form onSubmit={form.handleSubmit((v) => void submit(v))} noValidate>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">{t('basicInfo')}</CardTitle>
          </CardHeader>
          <CardContent>
            {submitError ? (
              <div className="mb-3">
                <ErrorText message={submitError} />
              </div>
            ) : null}
            <FormGrid>
              <Field label={t('firstName')} htmlFor="a-first" required error={form.formState.errors.firstName?.message}>
                <Input id="a-first" {...form.register('firstName')} invalid={Boolean(form.formState.errors.firstName)} />
              </Field>
              <Field label={t('lastName')} htmlFor="a-last" required error={form.formState.errors.lastName?.message}>
                <Input id="a-last" {...form.register('lastName')} invalid={Boolean(form.formState.errors.lastName)} />
              </Field>
              <Field label={t('gender')} htmlFor="a-gender" required>
                <Select
                  id="a-gender"
                  {...form.register('gender')}
                  options={GENDERS.map((g) => ({ value: g.value, label: tt(g.labelKey) }))}
                />
              </Field>
              <Field label={t('birthDate')} htmlFor="a-birth" required error={form.formState.errors.birthDate?.message}>
                <div className="flex gap-2">
                  <DatePicker id="a-birth" {...form.register('birthDate')} invalid={Boolean(form.formState.errors.birthDate)} />
                  <Button type="button" variant="outline" size="icon" onClick={() => void suggestCategory()} aria-label={t('ageCategory')}>
                    <Sparkles className="size-4" aria-hidden />
                  </Button>
                </div>
              </Field>
              <Field label={t('sport')} htmlFor="a-sport">
                <Select
                  id="a-sport"
                  {...form.register('sportId')}
                  placeholder={tc('none')}
                  options={(sports.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
              <Field label={t('ageCategory')} htmlFor="a-cat">
                <Select
                  id="a-cat"
                  {...form.register('ageCategoryId')}
                  placeholder={tc('none')}
                  options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
              <Field label={t('registrationDate')} htmlFor="a-regdate" required>
                <DatePicker id="a-regdate" {...form.register('registrationDate')} />
              </Field>
              <Field label={t('status')} htmlFor="a-status">
                <Select
                  id="a-status"
                  {...form.register('status')}
                  options={ATHLETE_STATUSES.map((s) => ({ value: s, label: ts(s) }))}
                />
              </Field>
            </FormGrid>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">{t('contactInfo')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid>
              <Field label={tc('phone')} htmlFor="a-phone" error={form.formState.errors.phone?.message}>
                <Input id="a-phone" type="tel" {...form.register('phone')} invalid={Boolean(form.formState.errors.phone)} />
              </Field>
              <Field label={tc('email')} htmlFor="a-email" error={form.formState.errors.email?.message}>
                <Input id="a-email" type="email" {...form.register('email')} invalid={Boolean(form.formState.errors.email)} />
              </Field>
              <Field label={tc('address')} htmlFor="a-address" full>
                <Input id="a-address" {...form.register('address')} />
              </Field>
              <Field label={t('emergencyName')} htmlFor="a-emname">
                <Input id="a-emname" {...form.register('emergencyName')} />
              </Field>
              <Field label={t('emergencyPhone')} htmlFor="a-emphone" error={form.formState.errors.emergencyPhone?.message}>
                <Input id="a-emphone" type="tel" {...form.register('emergencyPhone')} invalid={Boolean(form.formState.errors.emergencyPhone)} />
              </Field>
              <Field label={tc('notes')} htmlFor="a-notes" full>
                <Textarea id="a-notes" {...form.register('notes')} />
              </Field>
              <Field label={t('additionalInfo')} htmlFor="a-addinfo" full>
                <Textarea id="a-addinfo" {...form.register('additionalInfo')} />
              </Field>
              <div className="sm:col-span-2">
                <Checkbox label={t('imageConsent')} {...form.register('imageConsent')} />
              </div>
            </FormGrid>
          </CardContent>
        </Card>

        {sensitive ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-sm">{t('medicalInfo')}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormGrid>
                <Field label={t('bloodType')} htmlFor="a-blood">
                  <Select
                    id="a-blood"
                    {...form.register('bloodType')}
                    placeholder={tc('none')}
                    options={BLOOD_TYPES.map((b) => ({ value: b, label: b }))}
                  />
                </Field>
                <Field label={t('allergies')} htmlFor="a-allergies">
                  <Input id="a-allergies" {...form.register('allergies')} />
                </Field>
                <Field label={t('medicalNotes')} htmlFor="a-med" full hint={t('sensitiveHint')}>
                  <Textarea id="a-med" {...form.register('medicalNotes')} />
                </Field>
              </FormGrid>
            </CardContent>
          </Card>
        ) : null}

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">{t('parents')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <SearchInput
                value={parentQuery}
                onSearch={(q) => void searchParents(q)}
                placeholder={t('addParent') + '…'}
              />
              {searchingParents ? <Loading label={tc('loading')} /> : null}
              {parentResults.length > 0 ? (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {parentResults.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>
                        {p.firstName} {p.lastName}
                        <span className="ltr-field ms-2 text-xs text-muted-foreground">{p.phone}</span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={parentLinks.some((l) => l.parentId === p.id)}
                        onClick={() =>
                          setParentLinks((prev) => [
                            ...prev,
                            {
                              parentId: p.id,
                              label: `${p.firstName} ${p.lastName} (${p.phone})`,
                              relationship: p.relationship ?? '',
                              isPrimary: prev.length === 0,
                              isPayer: false,
                              isEmergency: false,
                            },
                          ])
                        }
                      >
                        <UserPlus className="size-4" aria-hidden />
                        {t('addParent')}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {parentLinks.length > 0 ? (
              <ul className="space-y-2">
                {parentLinks.map((link, idx) => (
                  <li key={link.parentId} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{link.label}</span>
                      <button
                        type="button"
                        onClick={() => setParentLinks((prev) => prev.filter((l) => l.parentId !== link.parentId))}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        aria-label={tc('delete')}
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="w-40">
                        <Input
                          aria-label={t('relationship')}
                          placeholder={t('relationship')}
                          value={link.relationship}
                          onChange={(e) =>
                            setParentLinks((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, relationship: e.target.value } : l)),
                            )
                          }
                        />
                      </div>
                      <Checkbox
                        label={t('primary')}
                        checked={link.isPrimary}
                        onChange={(e) =>
                          setParentLinks((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, isPrimary: e.target.checked } : l)),
                          )
                        }
                      />
                      <Checkbox
                        label={t('payer')}
                        checked={link.isPayer}
                        onChange={(e) =>
                          setParentLinks((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, isPayer: e.target.checked } : l)),
                          )
                        }
                      />
                      <Checkbox
                        label={t('emergency')}
                        checked={link.isEmergency}
                        onChange={(e) =>
                          setParentLinks((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, isEmergency: e.target.checked } : l)),
                          )
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{t('parents')}</p>
            )}
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

      {/* تحذير التكرار */}
      <ConfirmDialog
        open={duplicates !== null && duplicates.length > 0}
        onOpenChange={(o) => {
          if (!o) {
            setDuplicates(null);
            setPendingBody(null);
          }
        }}
        title={t('duplicateWarning')}
        tone="warning"
        confirmLabel={tc('create')}
        message={
          <div className="space-y-2">
            <p>{t('duplicateWarning')}</p>
            <ul className="space-y-1">
              {(duplicates ?? []).slice(0, 5).map((d) => (
                <li key={d.athleteId} className="rounded border border-border px-2 py-1 text-xs">
                  <span className="ltr-field">{d.registrationNo}</span> — {d.firstName} {d.lastName} ({fmt.date(d.birthDate)})
                  <span className="ms-1 text-muted-foreground">[{d.reasons.join(', ')}]</span>
                </li>
              ))}
            </ul>
          </div>
        }
        onConfirm={() => {
          if (pendingBody) void send({ ...pendingBody, overrideDuplicate: true });
        }}
      />
    </div>
  );
}
