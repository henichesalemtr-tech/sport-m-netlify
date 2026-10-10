'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Dumbbell } from 'lucide-react';
import { ApiClientError, apiGet, apiPost } from '@/shared/api/client';
import { Link } from '@/shared/i18n/navigation';
import { LocaleSwitcher } from '@/shared/components/locale-switcher';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select } from '@/shared/ui-kit/select';
import { Field, ErrorText } from '@/shared/ui-kit/form';
import { Loading } from '@/shared/ui-kit/loading';
import type { SetupStatus } from '@/shared/api/types';

const TIMEZONES = [
  'Africa/Algiers',
  'Africa/Casablanca',
  'Africa/Tunis',
  'Africa/Cairo',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Europe/Paris',
  'UTC',
];

export function SetupScreen() {
  const t = useTranslations('setup');
  const ta = useTranslations('auth');
  const tc = useTranslations('common');
  const tv = useTranslations('ui.validation');
  const locale = useLocale();
  const prefix = locale === 'ar' ? '' : `/${locale}`;

  const [checking, setChecking] = useState(true);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<SetupStatus>('/setup')
      .then((r) => setAlreadyDone(!r.data.needsSetup))
      .catch(() => setAlreadyDone(false))
      .finally(() => setChecking(false));
  }, []);

  const schema = z
    .object({
      orgName: z.string().min(2, tv('minLength', { min: 2 })),
      currencyCode: z.string().min(3, tv('minLength', { min: 3 })).max(10),
      timezone: z.string().min(2, tv('required')),
      fullName: z.string().min(3, tv('minLength', { min: 3 })),
      email: z.string().email(tv('email')),
      password: z.string().min(8, tv('passwordMin')),
      confirmPassword: z.string().min(1, tv('required')),
    })
    .refine((v) => v.password === v.confirmPassword, {
      message: ta('passwordMismatch'),
      path: ['confirmPassword'],
    });
  type SetupValues = z.infer<typeof schema>;

  const form = useForm<SetupValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      orgName: '',
      currencyCode: 'DZD',
      timezone: 'Africa/Algiers',
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const submit = async (values: SetupValues) => {
    setFormError(null);
    try {
      await apiPost('/setup', {
        orgName: values.orgName,
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        currencyCode: values.currencyCode,
        timezone: values.timezone,
      });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiClientError && e.fieldErrors) {
        for (const [key, msgs] of Object.entries(e.fieldErrors)) {
          form.setError(key as never, { message: msgs[0] });
        }
      } else {
        setFormError(e instanceof ApiClientError ? e.message || tc('errorGeneric') : tc('errorGeneric'));
      }
    }
  };

  if (checking) return <Loading label={tc('loading')} />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-8">
      <div className="absolute end-4 top-4">
        <LocaleSwitcher />
      </div>
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Dumbbell className="size-7" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        {alreadyDone && !done ? (
          <div className="card p-6 text-center">
            <p className="mb-4 text-sm">{t('alreadyExists')}</p>
            <Link href="/login">
              <Button type="button" className="w-full">{ta('login')}</Button>
            </Link>
          </div>
        ) : done ? (
          <div className="card flex flex-col items-center gap-3 p-6 text-center">
            <CheckCircle2 className="size-10 text-success" aria-hidden />
            <p className="font-semibold">{t('success')}</p>
            <Link href="/login" className="w-full">
              <Button type="button" className="w-full" size="lg">{ta('login')}</Button>
            </Link>
          </div>
        ) : (
          <div className="card p-5">
            {/* مؤشر الخطوات */}
            <div className="mb-5 flex items-center gap-2" aria-hidden>
              {[1, 2].map((s) => (
                <div
                  key={s}
                  className={
                    s === step
                      ? 'h-1.5 flex-1 rounded-full bg-primary'
                      : 'h-1.5 flex-1 rounded-full bg-muted'
                  }
                />
              ))}
            </div>

            <form onSubmit={form.handleSubmit((v) => void submit(v))} noValidate className="space-y-4">
              {formError ? <ErrorText message={formError} /> : null}

              <fieldset disabled={step !== 1} className={step !== 1 ? 'hidden' : 'space-y-4'}>
                <legend className="mb-2 text-sm font-bold">{t('orgSection')}</legend>
                <Field label={t('orgName')} htmlFor="su-org" required error={form.formState.errors.orgName?.message}>
                  <Input id="su-org" {...form.register('orgName')} invalid={Boolean(form.formState.errors.orgName)} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('currencyCode')} htmlFor="su-cur" required error={form.formState.errors.currencyCode?.message}>
                    <Input id="su-cur" ltr {...form.register('currencyCode')} invalid={Boolean(form.formState.errors.currencyCode)} />
                  </Field>
                  <Field label={t('timezone')} htmlFor="su-tz" required error={form.formState.errors.timezone?.message}>
                    <Select
                      id="su-tz"
                      {...form.register('timezone')}
                      options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
                    />
                  </Field>
                </div>
              </fieldset>

              <fieldset disabled={step !== 2} className={step !== 2 ? 'hidden' : 'space-y-4'}>
                <legend className="mb-2 text-sm font-bold">{t('adminSection')}</legend>
                <Field label={t('fullName')} htmlFor="su-name" required error={form.formState.errors.fullName?.message}>
                  <Input id="su-name" {...form.register('fullName')} invalid={Boolean(form.formState.errors.fullName)} />
                </Field>
                <Field label={t('email')} htmlFor="su-email" required error={form.formState.errors.email?.message}>
                  <Input id="su-email" type="email" autoComplete="username" {...form.register('email')} invalid={Boolean(form.formState.errors.email)} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('password')} htmlFor="su-pw" required hint={t('passwordHint')} error={form.formState.errors.password?.message}>
                    <Input id="su-pw" type="password" autoComplete="new-password" {...form.register('password')} invalid={Boolean(form.formState.errors.password)} />
                  </Field>
                  <Field label={t('confirmPassword')} htmlFor="su-pw2" required error={form.formState.errors.confirmPassword?.message}>
                    <Input id="su-pw2" type="password" autoComplete="new-password" {...form.register('confirmPassword')} invalid={Boolean(form.formState.errors.confirmPassword)} />
                  </Field>
                </div>
              </fieldset>

              <div className="flex items-center justify-between gap-2 pt-2">
                {step === 2 ? (
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    {tc('previous')}
                  </Button>
                ) : (
                  <span />
                )}
                {step === 1 ? (
                  <Button
                    type="button"
                    onClick={async () => {
                      const ok = await form.trigger(['orgName', 'currencyCode', 'timezone']);
                      if (ok) setStep(2);
                    }}
                  >
                    {tc('next')}
                  </Button>
                ) : (
                  <Button type="submit" loading={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? t('submitting') : t('submit')}
                  </Button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
