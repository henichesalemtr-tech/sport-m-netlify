import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { dateOnlySchema, uuidSchema } from '@/shared/validation/common';

export const REPORT_TYPES = [
  'athletes',
  'subscriptions',
  'payments',
  'debts',
  'attendance',
  'absence',
  'late',
  'coaches',
  'sports',
  'groups',
  'revenues',
  'expenses',
  'cash',
] as const;

export const reportTypeSchema = z.enum(REPORT_TYPES);
export type ReportType = z.infer<typeof reportTypeSchema>;

/** التقارير المالية تتطلب reports.view_finance إضافة إلى reports.view. */
export const FINANCE_REPORTS: readonly ReportType[] = [
  'subscriptions',
  'payments',
  'debts',
  'revenues',
  'expenses',
  'cash',
];

export function isFinanceReport(type: ReportType): boolean {
  return FINANCE_REPORTS.includes(type);
}

export const reportParamsSchema = z.object({ type: reportTypeSchema });

export const reportQuerySchema = listQuerySchema.extend({
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
  sportId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  coachId: uuidSchema.optional(),
  ageCategoryId: uuidSchema.optional(),
  athleteId: uuidSchema.optional(),
  /** حالة عامة (حسب نوع التقرير: حالة الرياضي/الاشتراك/الدفعة/نوع حركة الخزينة). */
  status: z.string().trim().max(30).optional(),
});

export const reportExportQuerySchema = reportQuerySchema.extend({
  format: z.enum(['csv', 'xlsx']).default('csv'),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
