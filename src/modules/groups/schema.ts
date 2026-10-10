import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import {
  dateOnlySchema,
  reasonSchema,
  uuidSchema,
  versionSchema,
} from '@/shared/validation/common';
import { TRAINING_DAYS } from './capacityRules';

export const trainingDaySchema = z.enum(TRAINING_DAYS);
export const groupStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const timeHHmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'الوقت يجب أن يكون بصيغة HH:mm');

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(2, 'اسم المجموعة قصير جدًا').max(120, 'اسم المجموعة طويل جدًا'),
    code: z
      .string()
      .trim()
      .min(2, 'رمز المجموعة قصير جدًا')
      .max(30, 'رمز المجموعة طويل جدًا')
      .regex(/^[A-Z0-9_-]+$/, 'رمز المجموعة أحرف لاتينية كبيرة وأرقام فقط'),
    sportId: uuidSchema,
    ageCategoryId: uuidSchema.nullable().optional(),
    coachId: uuidSchema.nullable().optional(),
    venueId: uuidSchema.nullable().optional(),
    maxCapacity: z.number().int().min(1, 'السعة القصوى 1 على الأقل').max(10000),
    trainingDays: z.array(trainingDaySchema).max(7).nullable().optional(),
    startTime: timeHHmmSchema.nullable().optional(),
    endTime: timeHHmmSchema.nullable().optional(),
    status: groupStatusSchema.default('ACTIVE'),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.startTime && val.endTime && val.endTime <= val.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'وقت النهاية يجب أن يكون بعد وقت البداية',
      });
    }
    if ((val.startTime && !val.endTime) || (!val.startTime && val.endTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'وقتا البداية والنهاية مطلوبان معًا',
      });
    }
  });

export const updateGroupSchema = z
  .object({
    name: createGroupSchema.shape.name,
    code: createGroupSchema.shape.code,
    sportId: createGroupSchema.shape.sportId,
    ageCategoryId: createGroupSchema.shape.ageCategoryId,
    coachId: createGroupSchema.shape.coachId,
    venueId: createGroupSchema.shape.venueId,
    maxCapacity: createGroupSchema.shape.maxCapacity,
    trainingDays: createGroupSchema.shape.trainingDays,
    startTime: createGroupSchema.shape.startTime,
    endTime: createGroupSchema.shape.endTime,
    status: createGroupSchema.shape.status,
    notes: createGroupSchema.shape.notes,
    version: versionSchema,
    /** خفض السعة تحت عدد الأعضاء الحاليين يتطلب صلاحية groups.override_capacity + سبب. */
    overrideReason: reasonSchema(5).optional(),
  })
  .partial()
  .extend({ version: versionSchema });

export const groupParamsSchema = z.object({ id: uuidSchema });

export const groupListQuerySchema = listQuerySchema.extend({
  sportId: uuidSchema.optional(),
  coachId: uuidSchema.optional(),
  venueId: uuidSchema.optional(),
  ageCategoryId: uuidSchema.optional(),
  status: groupStatusSchema.optional(),
});

/** إضافة عضو — تجاوز السعة يتطلب overrideCapacity + سبب إلزامي + صلاحية. */
export const addMemberSchema = z
  .object({
    athleteId: uuidSchema,
    joinedAt: dateOnlySchema.optional(),
    overrideCapacity: z.boolean().optional(),
    overrideReason: reasonSchema(5).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.overrideCapacity === true && !val.overrideReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overrideReason'],
        message: 'سبب تجاوز السعة إلزامي',
      });
    }
  });

export const removeMemberSchema = z.object({
  athleteId: uuidSchema,
  leaveReason: reasonSchema(3),
  leftAt: dateOnlySchema.optional(),
});

export const memberListQuerySchema = listQuerySchema.extend({
  active: z.enum(['true', 'false', 'all']).default('true'),
});

export const transferMemberSchema = z
  .object({
    athleteId: uuidSchema,
    toGroupId: uuidSchema,
    reason: reasonSchema(5),
    leftAt: dateOnlySchema.optional(),
    overrideCapacity: z.boolean().optional(),
    overrideReason: reasonSchema(5).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.overrideCapacity === true && !val.overrideReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overrideReason'],
        message: 'سبب تجاوز السعة إلزامي',
      });
    }
  });

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type GroupListQuery = z.infer<typeof groupListQuerySchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;
export type TransferMemberInput = z.infer<typeof transferMemberSchema>;
