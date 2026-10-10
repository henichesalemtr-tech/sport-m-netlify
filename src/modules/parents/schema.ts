import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { emailSchema, phoneSchema, uuidSchema, versionSchema } from '@/shared/validation/common';

const nameField = (label: string) =>
  z.string().trim().min(2, `${label} قصير جدًا`).max(80, `${label} طويل جدًا`);

/** ربط ولي برياضي (AthleteParent) مع أدوار العلاقة. */
export const parentAthleteLinkSchema = z.object({
  athleteId: uuidSchema,
  relationship: z.string().trim().max(50, 'صلة القرابة طويلة جدًا').optional(),
  isPrimary: z.boolean().optional(),
  isPayer: z.boolean().optional(),
  isEmergency: z.boolean().optional(),
});

export const createParentSchema = z.object({
  firstName: nameField('الاسم'),
  lastName: nameField('اللقب'),
  phone: phoneSchema,
  phone2: phoneSchema.optional(),
  email: emailSchema.optional(),
  address: z.string().trim().max(500).optional(),
  relationship: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(5000).optional(),
  athletes: z.array(parentAthleteLinkSchema).max(20, 'عدد الأبناء كبير جدًا').optional(),
  /** تجاوز تحذير تكرار الهاتف. */
  overrideDuplicate: z.boolean().optional(),
});

export const updateParentSchema = createParentSchema
  .omit({ overrideDuplicate: true })
  .partial()
  .extend({ version: versionSchema });

export const parentParamsSchema = z.object({ id: uuidSchema });

export const deleteParentBodySchema = z.object({ version: versionSchema });

export const parentListQuerySchema = listQuerySchema.extend({
  includeDeleted: z.enum(['true', 'false']).optional(),
});

export type CreateParentInput = z.infer<typeof createParentSchema>;
export type UpdateParentInput = z.infer<typeof updateParentSchema>;
export type ParentListQuery = z.infer<typeof parentListQuerySchema>;
export type ParentAthleteLink = z.infer<typeof parentAthleteLinkSchema>;
