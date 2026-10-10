import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import {
  dateOnlySchema,
  moneyStringSchema,
  reasonSchema,
  uuidSchema,
} from '@/shared/validation/common';

export const createPaymentSchema = z.object({
  athleteId: uuidSchema,
  subscriptionId: uuidSchema,
  /** مبلغ عشري كنص — يُحوَّل لأصغر وحدة BigInt في الخدمة (ممنوع float). */
  amount: moneyStringSchema,
  /** خصم على الدفعة نفسها (اختياري) — لا يتجاوز المبلغ. */
  discount: moneyStringSchema.optional(),
  paymentMethodId: uuidSchema,
  paymentDate: dateOnlySchema,
  employeeId: uuidSchema.nullish(),
  notes: z.string().trim().max(2000).optional(),
});

export const voidPaymentSchema = z.object({
  reason: reasonSchema(5),
});

export const refundPaymentSchema = z.object({
  amount: moneyStringSchema,
  reason: reasonSchema(5),
});

export const updatePaymentNotesSchema = z.object({
  notes: z.string().trim().max(2000).nullable(),
});

export const paymentParamsSchema = z.object({ id: uuidSchema });

export const paymentListQuerySchema = listQuerySchema.extend({
  athleteId: uuidSchema.optional(),
  subscriptionId: uuidSchema.optional(),
  status: z.enum(['COMPLETED', 'VOIDED']).optional(),
  paymentMethodId: uuidSchema.optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
export type UpdatePaymentNotesInput = z.infer<typeof updatePaymentNotesSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
