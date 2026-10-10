import { z } from 'zod';
import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { sessionService } from '@/modules/sessions/service';
import { sessionParamsSchema, updateSessionSchema } from '@/modules/sessions/schema';

const deleteBodySchema = z.object({ version: z.number().int().nonnegative() });

export const GET = apiRoute({
  params: sessionParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'sessions.view');
    return { data: await sessionService.getById(params.id, user) };
  },
});

export const PATCH = apiRoute({
  params: sessionParamsSchema,
  body: updateSessionSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sessions.edit');
    const updated = await sessionService.update(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: sessionParamsSchema,
  body: deleteBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sessions.delete');
    const result = await sessionService.remove(params.id, body.version, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
