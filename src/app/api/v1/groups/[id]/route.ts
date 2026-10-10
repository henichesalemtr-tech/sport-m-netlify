import { z } from 'zod';
import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { groupService } from '@/modules/groups/service';
import { groupParamsSchema, updateGroupSchema } from '@/modules/groups/schema';

const deleteBodySchema = z.object({ version: z.number().int().nonnegative() });

export const GET = apiRoute({
  params: groupParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'groups.view');
    return { data: await groupService.getById(params.id, user) };
  },
});

export const PATCH = apiRoute({
  params: groupParamsSchema,
  body: updateGroupSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'groups.edit');
    const updated = await groupService.update(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: groupParamsSchema,
  body: deleteBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'groups.delete');
    const result = await groupService.remove(params.id, body.version, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
