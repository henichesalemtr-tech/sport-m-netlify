import { z } from 'zod';
import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { sportService } from '@/modules/sports/service';
import { updateSportSchema, sportParamsSchema } from '@/modules/sports/schema';

const deleteBodySchema = z.object({ version: z.number().int().nonnegative() });

export const GET = apiRoute({
  params: sportParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'sports.view');
    return { data: await sportService.getById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: sportParamsSchema,
  body: updateSportSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sports.manage');
    const meta = { user, requestId, ip, userAgent };
    const { isActive, version, ...rest } = body;
    // التعطيل/التفعيل له قواعد عمل خاصة (فحص المجموعات النشطة)
    const updated =
      isActive !== undefined && Object.keys(rest).length === 0
        ? await sportService.setActive(params.id, version, isActive, meta)
        : await sportService.update(params.id, body, meta);
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: sportParamsSchema,
  body: deleteBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sports.manage');
    const result = await sportService.remove(params.id, body.version, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
