import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { dateOnlySchema, uuidSchema } from '@/shared/validation/common';

/** معيار تقييم واحد داخل قالب (مقياس رقمي مثل 1-5). */
export const criterionSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/, 'مفتاح المعيار يجب أن يكون لاتينيًا بلا مسافات'),
    label: z.string().trim().min(1, 'اسم المعيار مطلوب').max(80),
    min: z.number().int('الحد الأدنى يجب أن يكون عددًا صحيحًا'),
    max: z.number().int('الحد الأقصى يجب أن يكون عددًا صحيحًا'),
  })
  .refine((c) => c.max > c.min, { message: 'الحد الأقصى يجب أن يكون أكبر من الأدنى', path: ['max'] });

export type Criterion = z.infer<typeof criterionSchema>;

export const createEvaluationTemplateSchema = z.object({
  name: z.string().trim().min(2, 'اسم القالب قصير جدًا').max(100, 'اسم القالب طويل جدًا'),
  sportId: uuidSchema.nullish(),
  criteria: z.array(criterionSchema).min(1, 'معيار واحد على الأقل').max(30, 'الحد الأقصى 30 معيارًا'),
  isActive: z.boolean().optional(),
});

export const updateEvaluationTemplateSchema = createEvaluationTemplateSchema.partial();

export const evaluationTemplateParamsSchema = z.object({ id: uuidSchema });

export const evaluationTemplateListQuerySchema = listQuerySchema.extend({
  sportId: uuidSchema.optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

/** درجات تقييم: {criterionKey: value} — القيم تُفحص مقابل حدود القالب في الخدمة. */
export const scoresSchema = z
  .record(z.string(), z.number('الدرجة يجب أن تكون رقمًا'))
  .refine((s) => Object.keys(s).length > 0, { message: 'درجة واحدة على الأقل' });

export const createEvaluationSchema = z.object({
  athleteId: uuidSchema,
  templateId: uuidSchema,
  coachId: uuidSchema.optional(),
  evaluationDate: dateOnlySchema,
  scores: scoresSchema,
  notes: z.string().trim().max(2000, 'الملاحظات طويلة جدًا').optional(),
});

export const updateEvaluationSchema = createEvaluationSchema.partial();

export const evaluationParamsSchema = z.object({ id: uuidSchema });

export const evaluationGroupParamsSchema = z.object({ groupId: uuidSchema });

export const evaluationListQuerySchema = listQuerySchema.extend({
  athleteId: uuidSchema.optional(),
  coachId: uuidSchema.optional(),
  templateId: uuidSchema.optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
});

export type CreateEvaluationTemplateInput = z.infer<typeof createEvaluationTemplateSchema>;
export type UpdateEvaluationTemplateInput = z.infer<typeof updateEvaluationTemplateSchema>;
export type EvaluationTemplateListQuery = z.infer<typeof evaluationTemplateListQuerySchema>;
export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;
export type UpdateEvaluationInput = z.infer<typeof updateEvaluationSchema>;
export type EvaluationListQuery = z.infer<typeof evaluationListQuerySchema>;
