import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('بريد إلكتروني غير صالح').max(254),
  password: z.string().min(1, 'كلمة المرور مطلوبة').max(200),
  totpCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'رمز التحقق يجب أن يتكون من 6 أرقام')
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة').max(200),
  newPassword: z.string().min(8, 'كلمة المرور الجديدة قصيرة جدًا').max(200),
});

export const enableTotpSchema = z.object({
  secret: z
    .string()
    .trim()
    .regex(/^[A-Z2-7]{16,64}$/i, 'سر TOTP غير صالح'),
  code: z.string().trim().regex(/^\d{6}$/, 'رمز التحقق يجب أن يتكون من 6 أرقام'),
});

export const disableTotpSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'رمز التحقق يجب أن يتكون من 6 أرقام'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type EnableTotpInput = z.infer<typeof enableTotpSchema>;
export type DisableTotpInput = z.infer<typeof disableTotpSchema>;
