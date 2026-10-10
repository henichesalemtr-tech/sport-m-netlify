import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { uuidSchema, versionSchema } from '@/shared/validation/common';

export const userRoleSchema = z.enum([
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPTION',
  'COACH',
  'ACCOUNTANT',
  'VIEWER',
]);

export const userStatusSchema = z.enum(['ACTIVE', 'DISABLED']);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'اسم المستخدم قصير جدًا')
  .max(50, 'اسم المستخدم طويل جدًا')
  .regex(/^[a-zA-Z0-9._-]+$/, 'اسم المستخدم يحوي أحرفًا غير مسموحة');

export const passwordSchema = z
  .string()
  .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
  .max(200, 'كلمة المرور طويلة جدًا');

export const createUserSchema = z.object({
  email: z.string().trim().email('بريد إلكتروني غير صالح').max(254),
  username: usernameSchema.optional(),
  fullName: z.string().trim().min(2, 'الاسم الكامل قصير جدًا').max(150, 'الاسم الكامل طويل جدًا'),
  password: passwordSchema,
  role: userRoleSchema.default('VIEWER'),
  linkedCoachId: uuidSchema.nullable().optional(),
  mustChangePassword: z.boolean().optional(),
});

export const updateUserSchema = createUserSchema
  .omit({ password: true, role: true })
  .partial()
  .extend({ version: versionSchema });

export const changeRoleSchema = z.object({
  role: userRoleSchema,
  version: versionSchema,
});

export const setUserStatusSchema = z.object({
  status: userStatusSchema,
  version: versionSchema,
});

export const adminResetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

export const deleteBodySchema = z.object({ version: versionSchema });

export const revokeSessionsBodySchema = z.object({
  /** إن غاب تُبطل كل جلسات المستخدم. */
  sessionId: uuidSchema.optional(),
});

export const userListQuerySchema = listQuerySchema.extend({
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
});

export const userParamsSchema = z.object({ id: uuidSchema });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type RevokeSessionsInput = z.infer<typeof revokeSessionsBodySchema>;
