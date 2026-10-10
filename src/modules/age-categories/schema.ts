import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { uuidSchema, versionSchema, dateOnlySchema } from '@/shared/validation/common';

export const ageCategoryKindSchema = z.enum(['NORMAL', 'SENIOR']);

const baseShape = {
  name: z.string().trim().min(2, 'اسم الفئة قصير جدًا').max(100, 'اسم الفئة طويل جدًا'),
  kind: ageCategoryKindSchema.default('NORMAL'),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
  maxAge: z.number().int().min(0).max(120).nullable().optional(),
  seasonStartMonth: z.number().int().min(1).max(12).default(9),
  sortOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
};

export const createAgeCategorySchema = z
  .object(baseShape)
  .superRefine((val, ctx) => {
    if (val.kind === 'SENIOR') {
      if (val.maxAge !== null && val.maxAge !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxAge'],
          message: 'فئة الأكابر يجب أن تكون بلا حد أقصى (maxAge = null)',
        });
      }
      if (val.minAge === null || val.minAge === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['minAge'],
          message: 'فئة الأكابر تتطلب عمرًا أدنى',
        });
      }
    } else {
      if (val.minAge === null || val.minAge === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minAge'], message: 'العمر الأدنى مطلوب' });
      }
      if (val.maxAge === null || val.maxAge === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxAge'], message: 'العمر الأقصى مطلوب' });
      }
      if (
        val.minAge !== null && val.minAge !== undefined &&
        val.maxAge !== null && val.maxAge !== undefined &&
        val.maxAge < val.minAge
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxAge'],
          message: 'العمر الأقصى يجب أن يكون أكبر من أو يساوي الأدنى',
        });
      }
    }
  });

export const updateAgeCategorySchema = z
  .object({
    ...baseShape,
    version: versionSchema,
  })
  .partial()
  .extend({ version: versionSchema });

export const ageCategoryParamsSchema = z.object({ id: uuidSchema });

export const ageCategoryListQuerySchema = listQuerySchema.extend({
  isActive: z.enum(['true', 'false']).optional(),
});

/** اقتراح الفئة من تاريخ الميلاد — تاريخ مرجعي اختياري (افتراضيًا حسب الإعداد). */
export const suggestQuerySchema = z.object({
  birthDate: dateOnlySchema,
  referenceDate: dateOnlySchema.optional(),
});

export type CreateAgeCategoryInput = z.infer<typeof createAgeCategorySchema>;
export type UpdateAgeCategoryInput = z.infer<typeof updateAgeCategorySchema>;
export type AgeCategoryListQuery = z.infer<typeof ageCategoryListQuerySchema>;
export type SuggestQuery = z.infer<typeof suggestQuerySchema>;
