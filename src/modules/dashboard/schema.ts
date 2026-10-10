import { z } from 'zod';
import { dateOnlySchema } from '@/shared/validation/common';

export const granularitySchema = z.enum(['day', 'week', 'month', 'year']);
export type GranularityValue = z.infer<typeof granularitySchema>;

export const financialQuerySchema = z.object({
  granularity: granularitySchema.default('month'),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
});

export const chartsQuerySchema = z.object({
  /** عدد الأيام لسلسلة الحضور (افتراضي 14). */
  attendanceDays: z.coerce.number().int().positive().max(90).default(14),
  /** عدد الشهور لسلسلة الإيراد/المصروف (افتراضي 12). */
  revenueMonths: z.coerce.number().int().positive().max(36).default(12),
});

export type FinancialQuery = z.infer<typeof financialQuerySchema>;
export type ChartsQuery = z.infer<typeof chartsQuerySchema>;
