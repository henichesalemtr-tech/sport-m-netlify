import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import {
  dateOnlySchema,
  emailSchema,
  phoneSchema,
  uuidSchema,
  versionSchema,
} from '@/shared/validation/common';

export const createCoachSchema = z.object({
  firstName: z.string().trim().min(2, 'الاسم قصير جدًا').max(60, 'الاسم طويل جدًا'),
  lastName: z.string().trim().min(2, 'اللقب قصير جدًا').max(60, 'اللقب طويل جدًا'),
  photoUrl: z.string().trim().url('رابط الصورة غير صالح').max(500).nullable().optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  email: emailSchema.optional(),
  specialization: z.string().trim().max(150).nullable().optional(),
  certificate: z.string().trim().max(150).nullable().optional(),
  joinedAt: dateOnlySchema.nullable().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** الرياضات التي يدربها (CoachSport). */
  sportIds: z.array(uuidSchema).max(20).optional(),
  /** ربط بحساب مستخدم بدوره COACH (User.linkedCoachId). */
  linkedUserId: uuidSchema.nullable().optional(),
});

/**
 * تحديث مدرب — تعطيل مدرب له مجموعات نشطة يتطلب تأكيدًا صريحًا
 * (confirmDeactivation) بعد إعادة الإسناد أو قبول المسؤولية.
 */
export const updateCoachSchema = createCoachSchema
  .partial()
  .extend({
    version: versionSchema,
    confirmDeactivation: z.boolean().optional(),
  });

export const coachParamsSchema = z.object({ id: uuidSchema });

export const coachListQuerySchema = listQuerySchema.extend({
  isActive: z.enum(['true', 'false']).optional(),
  sportId: uuidSchema.optional(),
});

export type CreateCoachInput = z.infer<typeof createCoachSchema>;
export type UpdateCoachInput = z.infer<typeof updateCoachSchema>;
export type CoachListQuery = z.infer<typeof coachListQuerySchema>;
