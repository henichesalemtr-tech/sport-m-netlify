import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { dateOnlySchema, moneyStringSchema, reasonSchema } from '@/shared/validation/common';

/** مبلغ تسوية موقّع (يسمح بالسالب) كنص عشري — يُحوَّل لأصغر وحدة في الخدمة. */
export const signedMoneyStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'المبلغ يجب أن يكون رقمًا (سالب أو موجب) بخانتين عشريتين على الأكثر')
  .refine((v) => v !== '0' && v !== '0.0' && v !== '0.00' && Number(v) !== 0, 'المبلغ يجب ألا يكون صفرًا');

export const cashTransactionTypeSchema = z.enum([
  'OPENING_BALANCE',
  'INCOME',
  'EXPENSE',
  'ADJUSTMENT',
  'REVERSAL',
]);

export const openingBalanceSchema = z.object({
  amount: moneyStringSchema,
  txDate: dateOnlySchema,
  reason: z.string().trim().max(500).optional(),
});

export const adjustCashSchema = z.object({
  amount: signedMoneyStringSchema,
  txDate: dateOnlySchema,
  reason: reasonSchema(5),
});

export const closeDaySchema = z.object({
  closingDate: dateOnlySchema,
  countedAmount: moneyStringSchema,
  /** إلزامي عند وجود فرق — يُتحقق منه في الخدمة بعد حساب المتوقع. */
  reason: z.string().trim().max(1000).optional(),
});

export const cashTransactionListQuerySchema = listQuerySchema.extend({
  type: cashTransactionTypeSchema.optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
  referenceType: z.enum(['payment', 'expense', 'refund', 'opening', 'adjustment']).optional(),
  referenceId: z.string().uuid().optional(),
});

export const cashClosingListQuerySchema = listQuerySchema.extend({
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
});

export type OpeningBalanceInput = z.infer<typeof openingBalanceSchema>;
export type AdjustCashInput = z.infer<typeof adjustCashSchema>;
export type CloseDayInput = z.infer<typeof closeDaySchema>;
export type CashTransactionListQuery = z.infer<typeof cashTransactionListQuerySchema>;
export type CashClosingListQuery = z.infer<typeof cashClosingListQuerySchema>;
