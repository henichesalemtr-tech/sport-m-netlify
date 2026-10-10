import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { uuidSchema, versionSchema } from '@/shared/validation/common';

export const venueTypeSchema = z.enum(['HALL', 'FIELD', 'COURT', 'POOL', 'GYM', 'OTHER']);
export const venueStatusSchema = z.enum(['AVAILABLE', 'MAINTENANCE', 'CLOSED']);

export const createVenueSchema = z.object({
  name: z.string().trim().min(2, 'اسم القاعة/الملعب قصير جدًا').max(120, 'اسم القاعة/الملعب طويل جدًا'),
  type: venueTypeSchema.default('HALL'),
  capacity: z.number().int().positive('السعة يجب أن تكون عددًا موجبًا').nullable().optional(),
  status: venueStatusSchema.default('AVAILABLE'),
  location: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updateVenueSchema = createVenueSchema.partial().extend({ version: versionSchema });

export const venueParamsSchema = z.object({ id: uuidSchema });

export const venueListQuerySchema = listQuerySchema.extend({
  type: venueTypeSchema.optional(),
  status: venueStatusSchema.optional(),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;
export type VenueListQuery = z.infer<typeof venueListQuerySchema>;
