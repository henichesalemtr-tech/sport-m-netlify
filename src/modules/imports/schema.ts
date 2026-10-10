import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { uuidSchema } from '@/shared/validation/common';

/** أنواع الكيانات القابلة للاستيراد. */
export const importEntitySchema = z.enum(['athlete']);
export type ImportEntity = z.infer<typeof importEntitySchema>;

/** وضع التعامل مع الصفوف غير الصالحة. */
export const importModeSchema = z.enum(['skip_invalid', 'abort_on_error']);
export type ImportMode = z.infer<typeof importModeSchema>;

export const importParamsSchema = z.object({ id: uuidSchema });

export const importListQuerySchema = listQuerySchema.extend({
  entityType: importEntitySchema.optional(),
  status: z
    .enum(['UPLOADED', 'MAPPED', 'PREVIEWED', 'VALIDATING', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .optional(),
});

/** mapping: اسم الحقل → فهرس العمود في الملف (0-based). */
export const saveMappingSchema = z.object({
  mapping: z.record(z.string(), z.number().int().nonnegative()),
});

export const confirmImportSchema = z.object({
  /** تأكيد اختياري إضافي (الواجهة تعرض الملخص قبل التأكيد). */
  acknowledge: z.literal(true).optional(),
});

export const templateQuerySchema = z.object({
  entityType: importEntitySchema.default('athlete'),
});

export const previewQuerySchema = z.object({
  /** عدد الصفوف المعروضة في المعاينة (افتراضي 50). */
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type SaveMappingInput = z.infer<typeof saveMappingSchema>;
export type ImportListQuery = z.infer<typeof importListQuerySchema>;
export type PreviewQuery = z.infer<typeof previewQuerySchema>;
