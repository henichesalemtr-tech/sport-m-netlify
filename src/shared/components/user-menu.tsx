'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { apiPost } from '@/shared/api/client';
import { useSession } from '@/shared/components/session-context';
import { useErrorText } from '@/shared/hooks/useApi';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Modal } from '@/shared/ui-kit/modal';
import { Field, ErrorText } from '@/shared/ui-kit/form';
import { useToast } from '@/shared/ui-kit/toast';
import { tr } from '@/features/common/tr';

interface TotpSetup {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');
}

/** قائمة المستخدم: الاسم/الدور + تغيير كلمة المرور + تسجيل الخروج. */
export function UserMenu() {
  const t = useTranslations('auth');
  const tu = useTranslations('user');
  const tc = useTranslations('common');
  const tv = useTranslations('ui.validation');
  const { user, settings } = useSession();
  const toast = useToast();
  const errorText = useErrorText();

  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [totpOpen, setTotpOpen] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);

  const changePassword = async () => {
    setFormError(null);
    if (newPassword.length < 8) {
      setFormError(tv('passwordMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError(t('passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await apiPost('/auth/change-password', { currentPassword, newPassword });
      toast.success(t('passwordChanged'));
      setPwdOpen(false);
      window.setTimeout(() => window.location.assign('/login'), 900);
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await apiPost('/auth/logout', {});
    } finally {
      window.location.assign('/login');
    }
  };

  const openTotp = async () => {
    setTotpOpen(true);
    setTotpError(null);
    setTotpSetup(null);
    setTotpCode('');
    setTotpDisableCode('');
  };

  const startTotpSetup = async () => {
    setTotpBusy(true);
    setTotpError(null);
    try {
      const res = await apiPost<TotpSetup>('/auth/totp/setup', {});
      setTotpSetup(res.data);
    } catch (e) {
      setTotpError(errorText(e));
    } finally {
      setTotpBusy(false);
    }
  };

  const confirmTotpEnable = async () => {
    if (!totpSetup) return;
    setTotpBusy(true);
    setTotpError(null);
    try {
      await apiPost('/auth/totp/enable', { secret: totpSetup.secret, code: totpCode });
      toast.success(t('totpEnabled'));
      setTotpOpen(false);
    } catch (e) {
      setTotpError(errorText(e));
    } finally {
      setTotpBusy(false);
    }
  };

  const confirmTotpDisable = async () => {
    setTotpBusy(true);
    setTotpError(null);
    try {
      await apiPost('/auth/totp/disable', { code: totpDisableCode });
      toast.success(t('totpDisabled'));
      setTotpOpen(false);
    } catch (e) {
      setTotpError(errorText(e));
    } finally {
      setTotpBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex min-h-touch items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('signedInAs', { name: user.fullName })}
          >
            <span className="hidden max-w-32 truncate font-medium text-foreground sm:block">
              {user.fullName}
            </span>
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
              {initials(user.fullName)}
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-50 w-64 rounded-lg border border-border bg-background p-1 shadow-xl"
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm font-bold">{user.fullName}</p>
              <p className="truncate text-xs text-muted-foreground ltr-field" dir="ltr">
                {user.email}
              </p>
              <p className="mt-1 text-xs text-primary">{tu(`roles.${user.role}`)}</p>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item asChild>
              <button
                type="button"
                onClick={() => setPwdOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <KeyRound className="size-4" aria-hidden />
                {t('changePassword')}
              </button>
            </DropdownMenu.Item>
            {settings.totpEnabled ? (
              <DropdownMenu.Item asChild>
                <button
                  type="button"
                  onClick={() => void openTotp()}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ShieldCheck className="size-4" aria-hidden />
                  {tr(t, 'twoFactor', 'التحقق الثنائي (2FA)')}
                </button>
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Item asChild>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-4" aria-hidden />
                {t('logout')}
              </button>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Modal
        open={pwdOpen}
        onOpenChange={(o) => {
          if (!busy) {
            setPwdOpen(o);
            setFormError(null);
          }
        }}
        title={t('changePassword')}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setPwdOpen(false)} disabled={busy}>
              {tc('cancel')}
            </Button>
            <Button type="button" onClick={() => void changePassword()} loading={busy}>
              {tc('save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('currentPassword')} htmlFor="cp-current" required>
            <Input
              id="cp-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
          <Field label={t('newPassword')} htmlFor="cp-new" required>
            <Input
              id="cp-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Field label={t('confirmPassword')} htmlFor="cp-confirm" required error={formError}>
            <Input
              id="cp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={totpOpen}
        onOpenChange={(o) => {
          if (!totpBusy) setTotpOpen(o);
        }}
        title={tr(t, 'twoFactor', 'التحقق الثنائي (2FA)')}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setTotpOpen(false)} disabled={totpBusy}>
              {tr(tc, 'close', 'إغلاق')}
            </Button>
            {totpSetup ? (
              <Button type="button" onClick={() => void confirmTotpEnable()} loading={totpBusy} disabled={!/^\d{6}$/.test(totpCode)}>
                {tr(t, 'confirmEnable', 'تأكيد التفعيل')}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          {totpError ? <ErrorText message={totpError} /> : null}
          {!totpSetup ? (
            <>
              <p className="text-sm text-muted-foreground">
                {tr(t, 'totpIntro', 'فعّل التحقق الثنائي لحماية حسابك عبر تطبيق مصادقة (Google Authenticator وغيرها).')}
              </p>
              <div className="space-y-2">
                <Button type="button" onClick={() => void startTotpSetup()} loading={totpBusy}>
                  {tr(t, 'startSetup', 'بدء الإعداد (توليد رمز QR)')}
                </Button>
              </div>
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  {tr(t, 'totpDisableHint', 'لتعطيل التحقق الثنائي، أدخل رمزًا حاليًا صالحًا.')}
                </p>
                <Field label={t('totpCode')} htmlFor="totp-disable">
                  <Input
                    id="totp-disable"
                    inputMode="numeric"
                    ltr
                    maxLength={6}
                    value={totpDisableCode}
                    onChange={(e) => setTotpDisableCode(e.target.value)}
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void confirmTotpDisable()}
                  loading={totpBusy}
                  disabled={!/^\d{6}$/.test(totpDisableCode)}
                >
                  {tr(t, 'disable', 'تعطيل')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={totpSetup.qrDataUrl} alt="QR" className="size-40 rounded-lg border border-border bg-white p-2" />
                <p className="text-xs text-muted-foreground">
                  {tr(t, 'scanOrEnter', 'امسح الرمز أو أدخل السر يدويًا:')}
                </p>
                <code dir="ltr" className="break-all rounded bg-muted px-2 py-1 text-xs">
                  {totpSetup.secret}
                </code>
              </div>
              <Field label={t('totpCode')} htmlFor="totp-enable">
                <Input
                  id="totp-enable"
                  inputMode="numeric"
                  ltr
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
