import { z } from 'zod';
import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { venueService } from '@/modules/venues/service';
import { updateVenueSchema, venueParamsSchema } from '@/modules/venues/schema';

const deleteBodySchema = z.object({ version: z.number().int().nonnegative() });

export const GET = apiRoute({
  params: venueParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'venues.view');
    return { data: await venueService.getById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: venueParamsSchema,
  body: updateVenueSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'venues.manage');
    const updated = await venueService.update(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: venueParamsSchema,
  body: deleteBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'venues.manage');
    const result = await venueService.remove(params.id, body.version, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
