'use client';

/**
 * نموذج المستخدم (إنشاء/تعديل) داخل Modal.
 * - إنشاء: POST /users — {email, username?, fullName, password, role, linkedCoachId?, mustChangePassword?}
 * - تعديل: PATCH /users/[id] — {email, username?, fullName, role, version}
 *   (PATCH يقبل أيضًا status — تستخدمه الشاشة مباشرة لتبديل الحالة).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiClientError, apiPatch, apiPost } from '@/shared/api/client';
import type { UserDto, UserRoleName } from '@/shared/api/types';
import { useErrorText } from '@/shared/hooks/useApi';
import { tr } from '@/features/common/tr';
import { USER_ROLES } from '@/shared/lib/options';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select } from '@/shared/ui-kit/select';
import { Checkbox } from '@/shared/ui-kit/date-picker';
import { Modal } from '@/shared/ui-kit/modal';
import { Field, ErrorText, FormGrid } from '@/shared/ui-kit/form';
import { useToast } from '@/shared/ui-kit/toast';

const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Values {
  fullName: string;
  email: string;
  username: string;
  role: UserRoleName;
  password: string;
  mustChangePassword: boolean;
  linkedCoachId: string;
}

interface UserFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = إنشاء، غير ذلك = تعديل. */
  user: UserDto | null;
  onSaved: () => void;
}

export function UserFormModal({ open, onOpenChange, user, onSaved }: UserFormModalProps) {
  const tu = useTranslations('user');
  const tc = useTranslations('common');
  const tv = useTranslations('ui.validation');
  const tToast = useTranslations('ui.toast');
  const toast = useToast();
  const errorText = useErrorText();
  const isEdit = user !== null;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const schema = useMemo(() => {
    const base = z.object({
      fullName: z
        .string()
        .trim()
        .min(2, tv('minLength', { min: 2 }))
        .max(150, tv('maxLength', { max: 150 })),
      email: z.string().trim().min(1, tv('required')).refine((v) => EMAIL_RE.test(v), tv('email')),
      username: z
        .string()
        .trim()
        .refine(
          (v) => v === '' || (USERNAME_RE.test(v) && v.length >= 3 && v.length <= 50),
          tr(tu, 'username', 'اسم المستخدم'),
        ),
      role: z.enum(['SUPER_ADMIN', 'ADMIN', 'RECEPTION', 'COACH', 'ACCOUNTANT', 'VIEWER']),
      password: z.string(),
      mustChangePassword: z.boolean(),
      linkedCoachId: z.string().trim(),
    });
    if (isEdit) return base;
    return base.superRefine((v, ctx) => {
      if (v.password.length < 8) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: tv('passwordMin'), path: ['password'] });
      }
    });
  }, [isEdit, tv, tu]);

  const defaults = useMemo<Values>(
    () => ({
      fullName: user?.fullName ?? '',
      email: user?.email ?? '',
      username: user?.username ?? '',
      role: user?.role ?? 'VIEWER',
      password: '',
      mustChangePassword: true,
      linkedCoachId: user?.linkedCoachId ?? '',
    }),
    [user],
  );

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: defaults,
  });

  // إعادة ضبط النموذج عند كل فتح (إنشاء جديد أو تعديل مستخدم آخر)
  useEffect(() => {
    if (open) {
      form.reset(defaults);
      setSubmitError(null);
    }
  }, [open, defaults, form]);

  const onSubmit = async (values: Values) => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const trimmed = {
        email: values.email.trim(),
        fullName: values.fullName.trim(),
        username: values.username.trim() || undefined,
        role: values.role,
      };
      if (isEdit && user) {
        // ملاحظة من src/app/api/v1/users/[id]/route.ts: إن احتوى جسم PATCH على role
        // يُنفَّذ changeRole فقط وتُهمل بقية الحقول — لذا call منفصل للدور عند تغيّره.
        let version = user.version;
        if (values.role !== user.role) {
          const r = await apiPatch<UserDto>(`/users/${user.id}`, { role: values.role, version });
          version = r.data.version;
        }
        const body: Record<string, unknown> = {
          email: trimmed.email,
          fullName: trimmed.fullName,
          version,
        };
        if (trimmed.username !== undefined) body.username = trimmed.username;
        await apiPatch(`/users/${user.id}`, body);
      } else {
        await apiPost('/users', {
          ...trimmed,
          password: values.password,
          mustChangePassword: values.mustChangePassword,
          linkedCoachId: values.linkedCoachId || undefined,
        });
      }
      toast.success(isEdit ? tToast('updated') : tToast('created'));
      onOpenChange(false);
      onSaved();
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

  const passwordError = form.formState.errors.password?.message;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
      }}
      title={isEdit ? tr(tu, 'editUser', 'تعديل المستخدم') : tr(tu, 'newUser', 'مستخدم جديد')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form="user-form" loading={submitting}>
            {tc('save')}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={form.handleSubmit((v) => void onSubmit(v))} noValidate>
        {submitError ? (
          <div className="mb-3">
            <ErrorText message={submitError} />
          </div>
        ) : null}
        <FormGrid>
          <Field label={tc('fullName')} htmlFor="u-full" required error={form.formState.errors.fullName?.message}>
            <Input id="u-full" {...form.register('fullName')} invalid={Boolean(form.formState.errors.fullName)} />
          </Field>
          <Field label={tc('email')} htmlFor="u-email" required error={form.formState.errors.email?.message}>
            <Input id="u-email" type="email" {...form.register('email')} invalid={Boolean(form.formState.errors.email)} />
          </Field>
          <Field
            label={tr(tu, 'username', 'اسم المستخدم')}
            htmlFor="u-username"
            optional
            hint="a-z A-Z 0-9 . _ - (3–50)"
            error={form.formState.errors.username?.message}
          >
            <Input
              id="u-username"
              dir="ltr"
              className="ltr-field"
              {...form.register('username')}
              invalid={Boolean(form.formState.errors.username)}
            />
          </Field>
          <Field label={tr(tu, 'role', 'الدور')} htmlFor="u-role" required>
            <Select
              id="u-role"
              {...form.register('role')}
              options={USER_ROLES.map((r) => ({ value: r, label: tr(tu, `roles.${r}`, r) }))}
            />
          </Field>
          {!isEdit ? (
            <>
              <Field
                label={tr(tc, 'password', 'كلمة المرور')}
                htmlFor="u-password"
                required
                hint={tv('passwordMin')}
                error={passwordError ?? null}
              >
                <Input
                  id="u-password"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  {...form.register('password')}
                  invalid={Boolean(form.formState.errors.password)}
                />
              </Field>
              <Field
                label={tr(tu, 'linkedCoach', 'الملف المرتبط (مدرب)')}
                htmlFor="u-coach"
                optional
                hint="UUID"
              >
                <Input id="u-coach" dir="ltr" className="ltr-field font-mono text-xs" {...form.register('linkedCoachId')} />
              </Field>
              <div className="sm:col-span-2">
                <Checkbox
                  id="u-mustchange"
                  label={tr(tu, 'mustChangePassword', 'تغيير إجباري لكلمة المرور')}
                  checked={Boolean(form.watch('mustChangePassword'))}
                  onChange={(e) => form.setValue('mustChangePassword', e.target.checked, { shouldDirty: true })}
                />
              </div>
            </>
          ) : null}
        </FormGrid>
      </form>
    </Modal>
  );
}
