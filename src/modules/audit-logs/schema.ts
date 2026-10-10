import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { dateOnlySchema, uuidSchema } from '@/shared/validation/common';

/** إجراءات التدقيق (مطابقة لـ AuditAction في Prisma). */
export const auditActionSchema = z.enum([
  'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE',
  'VOID', 'REFUND', 'VIEW_SENSITIVE', 'EXPORT', 'IMPORT', 'BACKUP',
  'RESTORE_BACKUP', 'ROLE_CHANGE', 'PERMISSION_CHANGE', 'SETTINGS_CHANGE',
  'PASSWORD_CHANGE',
]);

export const auditLogListQuerySchema = listQuerySchema.extend({
  action: auditActionSchema.optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
  requestId: z.string().trim().max(64).optional(),
});

export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
