import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import {
  dateOnlySchema,
  moneyStringSchema,
  reasonSchema,
  uuidSchema,
  versionSchema,
} from '@/shared/validation/common';
import { subscriptionTypeKindSchema } from '@/modules/subscription-types/schema';

/** نسبة مئوية كنص (≤ 100 بخانتين عشريتين) — تُخزَّن ×100 كأصغر وحدة. */
export const percentStringSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, 'النسبة يجب أن تكون رقمًا بخانتين عشريتين على الأكثر')
  .refine((v) => Number(v) > 0 && Number(v) <= 100, 'النسبة يجب أن تكون بين 0 و 100');

/** الخصم: نوع + قيمة + سبب إلزامي (7.9) — يتطلب إذن subscriptions.apply_discount. */
export const subscriptionDiscountSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('FIXED'),
    value: moneyStringSchema,
    reason: reasonSchema(5),
  }),
  z.object({
    kind: z.literal('PERCENT'),
    value: percentStringSchema,
    reason: reasonSchema(5),
  }),
]);

export const createSubscriptionSchema = z.object({
  athleteId: uuidSchema,
  sportId: uuidSchema.nullish(),
  groupId: uuidSchema.nullish(),
  subscriptionTypeId: uuidSchema,
  startDate: dateOnlySchema,
  /** اختياري للأنواع ذات المدة — إلزامي لنوع الحصص/CUSTOM بلا مدة. */
  endDate: dateOnlySchema.optional(),
  /** تجاوز السعر الافتراضي — مسموح فقط إذا كان النوع allowPriceEdit. */
  price: moneyStringSchema.optional(),
  discount: subscriptionDiscountSchema.optional(),
  dueDate: dateOnlySchema.optional(),
  sessionsTotal: z.number().int().positive().max(10000).nullish(),
});

export const updateSubscriptionSchema = z.object({
  sportId: uuidSchema.nullish(),
  groupId: uuidSchema.nullish(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
  price: moneyStringSchema.optional(),
  /** null = إزالة الخصم. */
  discount: subscriptionDiscountSchema.nullish(),
  dueDate: dateOnlySchema.optional(),
  sessionsTotal: z.number().int().positive().max(10000).nullish(),
  version: versionSchema,
});

export const renewSubscriptionSchema = z.object({
  /** تجاوز تاريخ البداية المحسوب (يوم بعد النهاية / اليوم إذا منتهي). */
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
  price: moneyStringSchema.optional(),
  discount: subscriptionDiscountSchema.optional(),
  dueDate: dateOnlySchema.optional(),
  version: versionSchema,
});

export const suspendSubscriptionSchema = z.object({
  reason: reasonSchema(5),
  suspendEnd: dateOnlySchema.optional(),
  version: versionSchema,
});

export const resumeSubscriptionSchema = z.object({ version: versionSchema });

export const cancelSubscriptionSchema = z.object({
  reason: reasonSchema(5),
  version: versionSchema,
});

export const subscriptionParamsSchema = z.object({ id: uuidSchema });

export const subscriptionStatusSchema = z.enum([
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'RENEWING',
  'CANCELLED',
]);

export const subscriptionListQuerySchema = listQuerySchema.extend({
  athleteId: uuidSchema.optional(),
  sportId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  subscriptionTypeId: uuidSchema.optional(),
  status: subscriptionStatusSchema.optional(),
  dueBefore: dateOnlySchema.optional(),
  expiringWithinDays: z.coerce.number().int().positive().max(365).optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type RenewSubscriptionInput = z.infer<typeof renewSubscriptionSchema>;
export type SuspendSubscriptionInput = z.infer<typeof suspendSubscriptionSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
export type SubscriptionListQuery = z.infer<typeof subscriptionListQuerySchema>;
export type SubscriptionDiscountInput = z.infer<typeof subscriptionDiscountSchema>;

export { subscriptionTypeKindSchema };
