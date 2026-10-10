'use client';

/** نموذج المجموعة (إنشاء/تعديل) — أيام تدريب متعددة، تحقق من الأوقات، سبب تجاوز عند خفض السعة. */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiClientError, apiPatch, apiPost } from '@/shared/api/client';
import type { AgeCategoryDto, CoachDto, GroupDto, SportDto, VenueDto } from '@/shared/api/types';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { GROUP_STATUSES, TRAINING_DAYS } from '@/shared/lib/options';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select } from '@/shared/ui-kit/select';
import { Textarea } from '@/shared/ui-kit/textarea';
import { Checkbox, TimePicker } from '@/shared/ui-kit/date-picker';
import { Field, ErrorText, FormActions, FormGrid } from '@/shared/ui-kit/form';
import { Loading } from '@/shared/ui-kit/loading';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { useToast } from '@/shared/ui-kit/toast';

const CODE_RE = /^[A-Z0-9_-]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseDays(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

export function GroupForm({ groupId }: { groupId?: string }) {
  const t = useTranslations('group');
  const tc = useTranslations('common');
  const ta = useTranslations('athlete');
  const ts = useTranslations('status');
  const td = useTranslations('days');
  const tv = useTranslations('ui.validation');
  const toast = useToast();
  const errorText = useErrorText();
  const router = useRouter();
  const { can } = useSession();
  const isEdit = Boolean(groupId);

  const existing = useApi<GroupDto>(isEdit ? `/groups/${groupId}` : null);
  const sports = useApi<SportDto[]>('/sports', { params: { pageSize: 100 } });
  const categories = useApi<AgeCategoryDto[]>('/age-categories', { params: { pageSize: 100 } });
  const coaches = useApi<CoachDto[]>('/coaches', { params: { pageSize: 100, isActive: 'true' } });
  const venues = useApi<VenueDto[]>('/venues', { params: { pageSize: 100 } });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [days, setDays] = useState<string[]>([]);

  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().min(2, tv('minLength', { min: 2 })).max(120, tv('maxLength', { max: 120 })),
          code: z
            .string()
            .min(2, tv('minLength', { min: 2 }))
            .max(30, tv('maxLength', { max: 30 }))
            .regex(CODE_RE, tv('codeFormat')),
          sportId: z.string().min(1, tv('required')),
          ageCategoryId: z.string(),
          coachId: z.string(),
          venueId: z.string(),
          maxCapacity: z
            .string()
            .regex(/^\d+$/, tv('integer'))
            .refine((v) => Number(v) >= 1, tv('positive')),
          startTime: z.string(),
          endTime: z.string(),
          status: z.enum(['ACTIVE', 'INACTIVE']),
          overrideReason: z.string(),
          notes: z.string(),
        })
        .superRefine((val, ctx) => {
          const hasStart = TIME_RE.test(val.startTime);
          const hasEnd = TIME_RE.test(val.endTime);
          if ((hasStart && !hasEnd) || (!hasStart && hasEnd)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: tv('required') });
          }
          if (hasStart && hasEnd && val.endTime <= val.startTime) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: tv('endTimeAfterStart') });
          }
          if (val.overrideReason !== '' && val.overrideReason.trim().length < 5) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['overrideReason'],
              message: tv('minLength', { min: 5 }),
            });
          }
        }),
    [tv],
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      name: '',
      code: '',
      sportId: '',
      ageCategoryId: '',
      coachId: '',
      venueId: '',
      maxCapacity: '',
      startTime: '',
      endTime: '',
      status: 'ACTIVE',
      overrideReason: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!existing.data) return;
    const g = existing.data;
    form.reset({
      name: g.name,
      code: g.code,
      sportId: g.sportId,
      ageCategoryId: g.ageCategoryId ?? '',
      coachId: g.coachId ?? '',
      venueId: g.venueId ?? '',
      maxCapacity: String(g.maxCapacity),
      startTime: g.startTime ? g.startTime.slice(0, 5) : '',
      endTime: g.endTime ? g.endTime.slice(0, 5) : '',
      status: g.status,
      overrideReason: '',
      notes: g.notes ?? '',
    });
    setDays(parseDays(g.trainingDays));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const membersCount = existing.data?.membersCount ?? existing.data?._count?.members ?? 0;
  const capacityWatch = form.watch('maxCapacity');
  const capacityLowered = isEdit && /^\d+$/.test(capacityWatch) && Number(capacityWatch) < membersCount;
  const needsOverrideReason = capacityLowered && can('groups.override_capacity');

  const submit = async (values: Values) => {
    setSubmitError(null);
    const body: Record<string, unknown> = {
      name: values.name.trim(),
      code: values.code.trim().toUpperCase(),
      sportId: values.sportId,
      ageCategoryId: values.ageCategoryId || null,
      coachId: values.coachId || null,
      venueId: values.venueId || null,
      maxCapacity: Number(values.maxCapacity),
      trainingDays: days.length > 0 ? days : null,
      startTime: values.startTime || null,
      endTime: values.endTime || null,
      status: values.status,
      notes: values.notes || null,
    };
    if (needsOverrideReason) body.overrideReason = values.overrideReason.trim();
    if (isEdit && existing.data) body.version = existing.data.version;
    setSubmitting(true);
    try {
      if (isEdit && existing.data) {
        await apiPatch(`/groups/${existing.data.id}`, body);
        toast.success(t('editGroup'));
        router.push(`/groups/${existing.data.id}`);
      } else {
        const r = await apiPost<GroupDto>('/groups', body);
        toast.success(t('newGroup'));
        router.push(`/groups/${r.data.id}`);
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
      <PageHeader title={isEdit ? t('editGroup') : t('newGroup')} backHref="/groups" backLabel={tc('back')} />

      <form onSubmit={form.handleSubmit((v) => void submit(v))} noValidate>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">{t('infoTab')}</CardTitle>
          </CardHeader>
          <CardContent>
            {submitError ? (
              <div className="mb-3">
                <ErrorText message={submitError} />
              </div>
            ) : null}
            <FormGrid>
              <Field label={tc('name')} htmlFor="g-name" required error={form.formState.errors.name?.message}>
                <Input id="g-name" {...form.register('name')} invalid={Boolean(form.formState.errors.name)} />
              </Field>
              <Field label={t('code')} htmlFor="g-code" required error={form.formState.errors.code?.message}>
                <Input id="g-code" ltr {...form.register('code')} invalid={Boolean(form.formState.errors.code)} />
              </Field>
              <Field label={t('sport')} htmlFor="g-sport" required error={form.formState.errors.sportId?.message}>
                <Select
                  id="g-sport"
                  {...form.register('sportId')}
                  placeholder={tc('none')}
                  options={(sports.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                  invalid={Boolean(form.formState.errors.sportId)}
                />
              </Field>
              <Field label={ta('ageCategory')} htmlFor="g-agecat">
                <Select
                  id="g-agecat"
                  {...form.register('ageCategoryId')}
                  placeholder={tc('none')}
                  options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
              <Field label={t('coach')} htmlFor="g-coach">
                <Select
                  id="g-coach"
                  {...form.register('coachId')}
                  placeholder={tc('none')}
                  options={(coaches.data ?? []).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
                />
              </Field>
              <Field label={t('venue')} htmlFor="g-venue">
                <Select
                  id="g-venue"
                  {...form.register('venueId')}
                  placeholder={tc('none')}
                  options={(venues.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
                />
              </Field>
              <Field label={t('capacity')} htmlFor="g-cap" required error={form.formState.errors.maxCapacity?.message}>
                <Input
                  id="g-cap"
                  type="text"
                  inputMode="numeric"
                  ltr
                  {...form.register('maxCapacity')}
                  invalid={Boolean(form.formState.errors.maxCapacity)}
                />
              </Field>
              <Field label={tc('status')} htmlFor="g-status">
                <Select
                  id="g-status"
                  {...form.register('status')}
                  options={GROUP_STATUSES.map((s) => ({ value: s, label: ts(s) }))}
                />
              </Field>
            </FormGrid>

            <div className="mt-4 space-y-4">
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-foreground">{t('trainingDays')}</legend>
                <div className="flex flex-wrap gap-3">
                  {TRAINING_DAYS.map((d) => (
                    <Checkbox
                      key={d}
                      id={`g-day-${d}`}
                      label={td(d)}
                      checked={days.includes(d)}
                      onChange={(e) =>
                        setDays((prev) => (e.target.checked ? [...prev, d] : prev.filter((x) => x !== d)))
                      }
                    />
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('startTime')} htmlFor="g-start">
                  <TimePicker id="g-start" {...form.register('startTime')} />
                </Field>
                <Field label={t('endTime')} htmlFor="g-end" error={form.formState.errors.endTime?.message}>
                  <TimePicker
                    id="g-end"
                    {...form.register('endTime')}
                    invalid={Boolean(form.formState.errors.endTime)}
                  />
                </Field>
              </div>

              {needsOverrideReason ? (
                <Field
                  label={t('overrideReason')}
                  htmlFor="g-override"
                  required
                  hint={t('capacityUsage', { current: String(membersCount), max: capacityWatch })}
                  error={form.formState.errors.overrideReason?.message}
                >
                  <Textarea
                    id="g-override"
                    {...form.register('overrideReason')}
                    invalid={Boolean(form.formState.errors.overrideReason)}
                  />
                </Field>
              ) : null}

              <Field label={tc('notes')} htmlFor="g-notes">
                <Textarea id="g-notes" {...form.register('notes')} />
              </Field>
            </div>
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
