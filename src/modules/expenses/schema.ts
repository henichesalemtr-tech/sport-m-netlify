import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import {
  dateOnlySchema,
  moneyStringSchema,
  reasonSchema,
  uuidSchema,
  versionSchema,
} from '@/shared/validation/common';

export const createExpenseSchema = z.object({
  /** مبلغ عشري كنص — يُحوَّل لأصغر وحدة BigInt في الخدمة (ممنوع float). */
  amount: moneyStringSchema,
  categoryId: uuidSchema,
  expenseDate: dateOnlySchema,
  description: z.string().trim().max(2000).optional(),
  beneficiary: z.string().trim().max(200).optional(),
  employeeId: uuidSchema.nullish(),
  /** مفاتيح تخزين المرفقات (خارج المجلد العام) — تُخزَّن JSON. */
  attachments: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial().extend({
  version: versionSchema,
});

export const voidExpenseSchema = z.object({
  reason: reasonSchema(5),
  version: versionSchema,
});

export const expenseParamsSchema = z.object({ id: uuidSchema });

export const expenseListQuerySchema = listQuerySchema.extend({
  categoryId: uuidSchema.optional(),
  employeeId: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'VOIDED']).optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
});

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(2, 'اسم الفئة قصير جدًا').max(100, 'اسم الفئة طويل جدًا'),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updateExpenseCategorySchema = createExpenseCategorySchema.partial();

export const expenseCategoryParamsSchema = z.object({ id: uuidSchema });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type VoidExpenseInput = z.infer<typeof voidExpenseSchema>;
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;
