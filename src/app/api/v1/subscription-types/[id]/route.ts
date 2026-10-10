import { z } from 'zod';
import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { subscriptionTypeService } from '@/modules/subscription-types/service';
import {
  updateSubscriptionTypeSchema,
  subscriptionTypeParamsSchema,
} from '@/modules/subscription-types/schema';

const deleteBodySchema = z.object({ version: z.number().int().nonnegative() });

export const GET = apiRoute({
  params: subscriptionTypeParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'subscriptions.view');
    return { data: await subscriptionTypeService.getById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: subscriptionTypeParamsSchema,
  body: updateSubscriptionTypeSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'subscriptions.edit');
    const meta = { user, requestId, ip, userAgent };
    const { isActive, version, ...rest } = body;
    // التعطيل/التفعيل عملية مستقلة عن بقية التعديلات
    const updated =
      isActive !== undefined && Object.keys(rest).length === 0
        ? await subscriptionTypeService.setActive(params.id, version, isActive, meta)
        : await subscriptionTypeService.update(params.id, body, meta);
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: subscriptionTypeParamsSchema,
  body: deleteBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'subscriptions.edit');
    const result = await subscriptionTypeService.remove(params.id, body.version, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
