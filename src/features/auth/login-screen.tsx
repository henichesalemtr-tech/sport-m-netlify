'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dumbbell, Info } from 'lucide-react';
import { ApiClientError, apiGet, apiPost } from '@/shared/api/client';
import { Link } from '@/shared/i18n/navigation';
import { LocaleSwitcher } from '@/shared/components/locale-switcher';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Field, ErrorText } from '@/shared/ui-kit/form';
import { useToast } from '@/shared/ui-kit/toast';
import type { SetupStatus } from '@/shared/api/types';

interface LoginResponse {
  user: { id: string; fullName: string; email: string; role: string };
  mustChangePassword: boolean;
}

export function LoginScreen({ nextPath, expired }: { nextPath: string | null; expired: boolean }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const tv = useTranslations('ui.validation');
  const locale = useLocale();
  const toast = useToast();
  const prefix = locale === 'ar' ? '' : `/${locale}`;

  const [needsSetup, setNeedsSetup] = useState(false);
  const [mode, setMode] = useState<'login' | 'change'>('login');
  const [showTotp, setShowTotp] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loginPassword, setLoginPassword] = useState('');

  useEffect(() => {
    apiGet<SetupStatus>('/setup')
      .then((r) => setNeedsSetup(r.data.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  const loginSchema = z.object({
    email: z.string().email(tv('email')),
    password: z.string().min(1, tv('required')),
    totpCode: z.string().regex(/^\d{6}$/, tv('number')).optional().or(z.literal('')),
  });
  type LoginValues = z.infer<typeof loginSchema>;

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema) as never,
    defaultValues: { email: '', password: '', totpCode: '' },
  });

  const changeSchema = z
    .object({
      currentPassword: z.string().min(1, tv('required')),
      newPassword: z.string().min(8, tv('passwordMin')),
      confirmPassword: z.string().min(1, tv('required')),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      message: t('passwordMismatch'),
      path: ['confirmPassword'],
    });
  type ChangeValues = z.infer<typeof changeSchema>;

  const changeForm = useForm<ChangeValues>({
    resolver: zodResolver(changeSchema) as never,
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const goApp = () => {
    window.location.assign(`${prefix}${nextPath ?? '/dashboard'}`);
  };

  const submitLogin = async (values: LoginValues) => {
    setFormError(null);
    try {
      const result = await apiPost<LoginResponse>('/auth/login', {
        email: values.email,
        password: values.password,
        totpCode: values.totpCode || undefined,
      });
      setLoginPassword(values.password);
      if (result.data.mustChangePassword) {
        setMode('change');
        changeForm.setValue('currentPassword', values.password);
      } else {
        goApp();
      }
    } catch (e) {
      if (e instanceof ApiClientError) {
        if (e.fieldErrors?.totpCode) {
          setShowTotp(true);
          loginForm.setError('totpCode', { message: e.fieldErrors.totpCode[0] });
        } else if (e.code === 'INVALID_CREDENTIALS') {
          setFormError(t('invalidCredentials'));
        } else if (e.code === 'ACCOUNT_LOCKED') {
          setFormError(t('accountLocked'));
        } else {
          setFormError(e.message || tc('errorGeneric'));
        }
      } else {
        setFormError(tc('errorGeneric'));
      }
    }
  };

  const submitChange = async (values: ChangeValues) => {
    setFormError(null);
    try {
      await apiPost('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success(t('passwordChanged'));
      goApp();
    } catch (e) {
      setFormError(e instanceof ApiClientError ? e.message || tc('errorGeneric') : tc('errorGeneric'));
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-8">
      <div className="absolute end-4 top-4">
        <LocaleSwitcher />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Dumbbell className="size-7" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold">{mode === 'login' ? t('loginTitle') : t('changePassword')}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? t('loginSubtitle') : t('mustChangePassword')}
          </p>
        </div>

        {expired ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            {t('sessionExpired')}
          </div>
        ) : null}

        {needsSetup && mode === 'login' ? (
          <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <p className="text-muted-foreground">{t('needsSetupHint')}</p>
            <Link href="/setup" className="mt-1 inline-block font-semibold text-primary underline-offset-4 hover:underline">
              {t('goToSetup')} →
            </Link>
          </div>
        ) : null}

        <div className="card p-5">
          {mode === 'login' ? (
            <form onSubmit={loginForm.handleSubmit((v) => void submitLogin(v))} noValidate className="space-y-4">
              {formError ? <ErrorText message={formError} /> : null}
              <Field label={t('email')} htmlFor="login-email" required error={loginForm.formState.errors.email?.message}>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  {...loginForm.register('email')}
                  invalid={Boolean(loginForm.formState.errors.email)}
                />
              </Field>
              <Field label={t('password')} htmlFor="login-password" required error={loginForm.formState.errors.password?.message}>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  {...loginForm.register('password')}
                  invalid={Boolean(loginForm.formState.errors.password)}
                />
              </Field>
              {showTotp ? (
                <Field label={t('totpCode')} htmlFor="login-totp" hint={t('totpHint')} error={loginForm.formState.errors.totpCode?.message}>
                  <Input
                    id="login-totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    {...loginForm.register('totpCode')}
                    invalid={Boolean(loginForm.formState.errors.totpCode)}
                  />
                </Field>
              ) : null}
              <Button type="submit" className="w-full" size="lg" loading={loginForm.formState.isSubmitting}>
                {loginForm.formState.isSubmitting ? t('signingIn') : t('login')}
              </Button>
            </form>
          ) : (
            <form onSubmit={changeForm.handleSubmit((v) => void submitChange(v))} noValidate className="space-y-4">
              {formError ? <ErrorText message={formError} /> : null}
              <Field label={t('currentPassword')} htmlFor="ch-current" required error={changeForm.formState.errors.currentPassword?.message}>
                <Input
                  id="ch-current"
                  type="password"
                  autoComplete="current-password"
                  {...changeForm.register('currentPassword')}
                />
              </Field>
              <Field label={t('newPassword')} htmlFor="ch-new" required error={changeForm.formState.errors.newPassword?.message}>
                <Input
                  id="ch-new"
                  type="password"
                  autoComplete="new-password"
                  {...changeForm.register('newPassword')}
                />
              </Field>
              <Field label={t('confirmPassword')} htmlFor="ch-confirm" required error={changeForm.formState.errors.confirmPassword?.message}>
                <Input
                  id="ch-confirm"
                  type="password"
                  autoComplete="new-password"
                  {...changeForm.register('confirmPassword')}
                />
              </Field>
              <Button type="submit" className="w-full" size="lg" loading={changeForm.formState.isSubmitting}>
                {tc('save')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setMode('login');
                  setFormError(null);
                  void loginPassword;
                }}
              >
                {tc('back')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
