import { z } from 'zod';
import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { coachService } from '@/modules/coaches/service';
import { coachParamsSchema, updateCoachSchema } from '@/modules/coaches/schema';

const deleteBodySchema = z.object({ version: z.number().int().nonnegative() });

export const GET = apiRoute({
  params: coachParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'coaches.view');
    return { data: await coachService.getById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: coachParamsSchema,
  body: updateCoachSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'coaches.edit');
    const updated = await coachService.update(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: coachParamsSchema,
  body: deleteBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'coaches.delete');
    const result = await coachService.remove(params.id, body.version, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
