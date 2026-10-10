import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { uuidSchema, versionSchema } from '@/shared/validation/common';

export const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'اللون يجب أن يكون بصيغة #RRGGBB');

export const createSportSchema = z.object({
  name: z.string().trim().min(2, 'اسم النشاط قصير جدًا').max(100, 'اسم النشاط طويل جدًا'),
  nameEn: z.string().trim().max(100).optional(),
  color: colorSchema.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updateSportSchema = createSportSchema
  .partial()
  .extend({ version: versionSchema });

export const sportParamsSchema = z.object({ id: uuidSchema });

export const sportListQuerySchema = listQuerySchema.extend({
  isActive: z.enum(['true', 'false']).optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
});

export type CreateSportInput = z.infer<typeof createSportSchema>;
export type UpdateSportInput = z.infer<typeof updateSportSchema>;
export type SportListQuery = z.infer<typeof sportListQuerySchema>;
