import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { moneyStringSchema, uuidSchema, versionSchema } from '@/shared/validation/common';

export const subscriptionTypeKindSchema = z.enum([
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUAL',
  'ANNUAL',
  'SESSIONS',
  'CUSTOM',
]);

/**
 * قواعد شكل النوع (7.9):
 * - الأنواع الزمنية تتطلب durationDays.
 * - نوع الحصص يتطلب sessionsTotal.
 * - CUSTOM حر (أي من الحقلين اختياري).
 */
export const createSubscriptionTypeSchema = z
  .object({
    name: z.string().trim().min(2, 'اسم النوع قصير جدًا').max(100, 'اسم النوع طويل جدًا'),
    kind: subscriptionTypeKindSchema,
    sportId: uuidSchema.nullish(),
    /** مبلغ عشري كنص — يُحوَّل لأصغر وحدة BigInt في الخدمة (ممنوع float). */
    defaultPrice: moneyStringSchema,
    durationDays: z.number().int().positive().max(3650).nullish(),
    sessionsTotal: z.number().int().positive().max(10000).nullish(),
    allowPriceEdit: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind !== 'SESSIONS' && val.kind !== 'CUSTOM' && !val.durationDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['durationDays'],
        message: 'مدة الأيام مطلوبة للأنواع الزمنية',
      });
    }
    if (val.kind === 'SESSIONS' && !val.sessionsTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessionsTotal'],
        message: 'عدد الحصص مطلوب لنوع الحصص',
      });
    }
  });

export const updateSubscriptionTypeSchema = createSubscriptionTypeSchema
  .partial()
  .extend({ version: versionSchema });

export const subscriptionTypeParamsSchema = z.object({ id: uuidSchema });

export const subscriptionTypeListQuerySchema = listQuerySchema.extend({
  kind: subscriptionTypeKindSchema.optional(),
  sportId: uuidSchema.optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateSubscriptionTypeInput = z.infer<typeof createSubscriptionTypeSchema>;
export type UpdateSubscriptionTypeInput = z.infer<typeof updateSubscriptionTypeSchema>;
export type SubscriptionTypeListQuery = z.infer<typeof subscriptionTypeListQuerySchema>;
