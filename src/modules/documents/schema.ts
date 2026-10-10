import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { dateOnlySchema, uuidSchema } from '@/shared/validation/common';

export const createDocumentTypeSchema = z.object({
  name: z.string().trim().min(2, 'اسم نوع الوثيقة قصير جدًا').max(80, 'اسم نوع الوثيقة طويل جدًا'),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updateDocumentTypeSchema = createDocumentTypeSchema.partial();

export const documentTypeParamsSchema = z.object({ id: uuidSchema });

export const documentTypeListQuerySchema = listQuerySchema.extend({
  isActive: z.enum(['true', 'false']).optional(),
});

/** حقول رفع الوثيقة (multipart/form-data — تُحلل يدويًا في المسار). */
export const uploadDocumentFieldsSchema = z.object({
  athleteId: uuidSchema,
  documentTypeId: uuidSchema,
  expiryDate: dateOnlySchema.optional(),
});

export const updateDocumentSchema = z.object({
  expiryDate: dateOnlySchema.nullish(),
});

export const documentParamsSchema = z.object({ id: uuidSchema });

export const documentListQuerySchema = listQuerySchema.extend({
  athleteId: uuidSchema.optional(),
  documentTypeId: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'DELETED']).optional(),
  /** الوثائق التي تنتهي خلال N يومًا (تنبيه الانتهاء). */
  expiringInDays: z.coerce.number().int().positive().max(365).optional(),
});

export const downloadQuerySchema = z.object({
  disposition: z.enum(['attachment', 'inline']).optional(),
});

export type CreateDocumentTypeInput = z.infer<typeof createDocumentTypeSchema>;
export type UpdateDocumentTypeInput = z.infer<typeof updateDocumentTypeSchema>;
export type DocumentTypeListQuery = z.infer<typeof documentTypeListQuerySchema>;
export type UploadDocumentFields = z.infer<typeof uploadDocumentFieldsSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
export type DownloadQuery = z.infer<typeof downloadQuerySchema>;
