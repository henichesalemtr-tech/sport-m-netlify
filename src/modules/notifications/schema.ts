import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { uuidSchema } from '@/shared/validation/common';

/** أنواع الإشعارات (مطابقة لـ NotificationType في Prisma). */
export const notificationTypeSchema = z.enum([
  'SUBSCRIPTION_EXPIRING',
  'SUBSCRIPTION_EXPIRED',
  'ABSENCE',
  'CONSECUTIVE_ABSENCE',
  'REPEATED_LATE',
  'NEW_PAYMENT',
  'OVERDUE_DEBT',
  'UPCOMING_SESSION',
  'SESSION_RESCHEDULED',
  'SESSION_CANCELLED',
  'DOCUMENT_EXPIRING',
]);

export type NotificationTypeValue = z.infer<typeof notificationTypeSchema>;

export const notificationListQuerySchema = listQuerySchema.extend({
  type: notificationTypeSchema.optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
  readOnly: z.enum(['true', 'false']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const notificationParamsSchema = z.object({ id: uuidSchema });

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
