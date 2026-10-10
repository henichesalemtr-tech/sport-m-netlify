import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { dateOnlySchema, reasonSchema, uuidSchema, versionSchema } from '@/shared/validation/common';

export const sessionTypeSchema = z.enum([
  'TRAINING',
  'MATCH',
  'TOURNAMENT',
  'EXAM',
  'ACTIVITY',
  'MEETING',
]);
export const sessionStatusSchema = z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']);
export const timeHHmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'الوقت يجب أن يكون بصيغة HH:mm');

const baseShape = {
  type: sessionTypeSchema.default('TRAINING'),
  title: z.string().trim().min(2, 'العنوان قصير جدًا').max(150, 'العنوان طويل جدًا'),
  sportId: uuidSchema.nullable().optional(),
  groupId: uuidSchema.nullable().optional(),
  coachId: uuidSchema.nullable().optional(),
  venueId: uuidSchema.nullable().optional(),
  sessionDate: dateOnlySchema,
  startTime: timeHHmmSchema,
  endTime: timeHHmmSchema,
  description: z.string().trim().max(2000).nullable().optional(),
  status: sessionStatusSchema.optional(),
};

export const createSessionSchema = z
  .object(baseShape)
  .refine((v) => v.endTime > v.startTime, {
    message: 'وقت النهاية يجب أن يكون بعد وقت البداية',
    path: ['endTime'],
  });

/** تعديل حصة: "هذه فقط" أو "كل السلسلة" (السلسلة تتجاوز الاستثناءات السابقة). */
export const updateSessionSchema = z
  .object({
    ...baseShape,
    version: versionSchema,
    applyTo: z.enum(['this', 'series']).default('this'),
  })
  .partial()
  .extend({ version: versionSchema, applyTo: z.enum(['this', 'series']).default('this') })
  .refine((v) => v.startTime === undefined || v.endTime === undefined || v.endTime > v.startTime, {
    message: 'وقت النهاية يجب أن يكون بعد وقت البداية',
    path: ['endTime'],
  });

export const sessionParamsSchema = z.object({ id: uuidSchema });

export const cancelSessionSchema = z.object({
  version: versionSchema,
  reason: reasonSchema(5),
});

export const rescheduleSessionSchema = z
  .object({
    version: versionSchema,
    sessionDate: dateOnlySchema,
    startTime: timeHHmmSchema,
    endTime: timeHHmmSchema,
    reason: reasonSchema(5).optional(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'وقت النهاية يجب أن يكون بعد وقت البداية',
    path: ['endTime'],
  });

/** توليد الحصص المتكررة من أيام/أوقات مجموعة ضمن نافذة زمنية متدحرجة. */
export const generateSessionsSchema = z
  .object({
    groupId: uuidSchema,
    fromDate: dateOnlySchema,
    toDate: dateOnlySchema.optional(),
  })
  .refine((v) => v.toDate === undefined || v.toDate >= v.fromDate, {
    message: 'نهاية النافذة يجب أن تكون بعد بدايتها',
    path: ['toDate'],
  });

export const sessionListQuerySchema = listQuerySchema.extend({
  groupId: uuidSchema.optional(),
  coachId: uuidSchema.optional(),
  venueId: uuidSchema.optional(),
  sportId: uuidSchema.optional(),
  type: sessionTypeSchema.optional(),
  status: sessionStatusSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  seriesId: uuidSchema.optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type CancelSessionInput = z.infer<typeof cancelSessionSchema>;
export type RescheduleSessionInput = z.infer<typeof rescheduleSessionSchema>;
export type GenerateSessionsInput = z.infer<typeof generateSessionsSchema>;
export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;
