import { z } from 'zod';

/** مخططات Zod مشتركة (مخطط واحد بين Frontend وBackend — 4.1). */

export const uuidSchema = z.string().uuid('معرّف غير صالح');

export const phoneSchema = z
  .string()
  .trim()
  .min(6, 'رقم الهاتف قصير جدًا')
  .max(20, 'رقم الهاتف طويل جدًا')
  .regex(/^[0-9+\s()-]+$/, 'رقم الهاتف يحتوي أحرفًا غير صالحة');

export const emailSchema = z.string().trim().email('بريد إلكتروني غير صالح').max(254).or(z.literal(''));

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD');

export const versionSchema = z.number().int().nonnegative();

/** مبلغ نقدي كنص عشري يُحوَّل لأصغر وحدة في طبقة الخدمة (ممنوع float للتخزين). */
export const moneyStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'المبلغ يجب أن يكون رقمًا موجبًا بخانتين عشريتين على الأكثر');

export const paginationResponseSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export const reasonSchema = (min = 3) =>
  z.string().trim().min(min, 'السبب مطلوب');
