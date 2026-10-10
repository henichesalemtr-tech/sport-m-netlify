import { z } from 'zod';
import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { ageCategoryService } from '@/modules/age-categories/service';
import {
  ageCategoryParamsSchema,
  updateAgeCategorySchema,
} from '@/modules/age-categories/schema';

const deleteBodySchema = z.object({ version: z.number().int().nonnegative() });

export const GET = apiRoute({
  params: ageCategoryParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'age_categories.view');
    return { data: await ageCategoryService.getById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: ageCategoryParamsSchema,
  body: updateAgeCategorySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'age_categories.manage');
    const updated = await ageCategoryService.update(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: ageCategoryParamsSchema,
  body: deleteBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'age_categories.manage');
    const result = await ageCategoryService.remove(params.id, body.version, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
