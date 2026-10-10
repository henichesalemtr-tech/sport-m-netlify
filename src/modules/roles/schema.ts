import { z } from 'zod';

export const roleEnumSchema = z.enum([
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPTION',
  'COACH',
  'ACCOUNTANT',
  'VIEWER',
]);

export const roleParamsSchema = z.object({ role: roleEnumSchema });

export const permissionCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z_]+\.[a-z_]+$/, 'رمز الصلاحية يجب أن يكون بصيغة module.action');

export const updateRolePermissionsSchema = z.object({
  permissions: z
    .array(
      z.object({
        code: permissionCodeSchema,
        granted: z.boolean(),
      }),
    )
    .min(1, 'أدخل صلاحية واحدة على الأقل')
    .max(300, 'عدد الصلاحيات كبير جدًا'),
});

export type RoleParam = z.infer<typeof roleParamsSchema>;
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
