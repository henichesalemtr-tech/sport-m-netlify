import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { uuidSchema } from '@/shared/validation/common';

export const backupParamsSchema = z.object({ id: uuidSchema });

export const backupListQuerySchema = listQuerySchema.extend({
  kind: z.string().trim().max(20).optional(),
});

export const createBackupSchema = z.object({
  kind: z.enum(['manual', 'daily', 'weekly', 'monthly']).optional(),
  reason: z.string().trim().max(500).optional(),
});

/** الاستعادة عملية خطيرة: تأكيد مكتوب + سبب إلزامي. */
export const restoreBackupSchema = z.object({
  backupId: uuidSchema,
  /** يجب كتابة RESTORE حرفيًا للتأكيد. */
  confirm: z.literal('RESTORE', { errorMap: () => ({ message: 'اكتب RESTORE للتأكيد' }) }),
  reason: z.string().trim().min(10, 'سبب الاستعادة مطلوب (10 أحرف على الأقل)').max(500),
});

export type BackupListQuery = z.infer<typeof backupListQuerySchema>;
export type CreateBackupInput = z.infer<typeof createBackupSchema>;
export type RestoreBackupInput = z.infer<typeof restoreBackupSchema>;
