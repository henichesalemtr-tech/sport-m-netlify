import { z } from 'zod';

/** أنواع قيم الإعدادات المدعومة. */
export const settingValueTypeSchema = z.enum(['string', 'number', 'boolean', 'json']);
export type SettingValueType = z.infer<typeof settingValueTypeSchema>;

/** مفتاح إعداد بصيغة group.key (أحرف لاتينية وأرقام ونقاط). */
export const settingKeySchema = z
  .string()
  .trim()
  .min(3, 'مفتاح الإعداد قصير جدًا')
  .max(120, 'مفتاح الإعداد طويل جدًا')
  .regex(/^[a-z][a-z0-9]*(\.[a-zA-Z0-9]+)+$/, 'مفتاح الإعداد يجب أن يكون بصيغة group.key');

export const settingsGroupQuerySchema = z.object({
  group: z.string().trim().min(1).max(60).optional(),
});

export const updateSettingBodySchema = z.object({
  value: z.unknown(),
  valueType: settingValueTypeSchema.optional(),
  group: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(500).optional(),
});

export const settingKeyParamSchema = z.object({ key: settingKeySchema });

export type UpdateSettingInput = z.infer<typeof updateSettingBodySchema>;
export type SettingsGroupQuery = z.infer<typeof settingsGroupQuerySchema>;
