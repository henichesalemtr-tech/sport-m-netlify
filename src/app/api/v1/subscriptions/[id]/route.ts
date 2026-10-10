import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { subscriptionService } from '@/modules/subscriptions/service';
import {
  updateSubscriptionSchema,
  subscriptionParamsSchema,
} from '@/modules/subscriptions/schema';

export const GET = apiRoute({
  params: subscriptionParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'subscriptions.view');
    return { data: await subscriptionService.getById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: subscriptionParamsSchema,
  body: updateSubscriptionSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'subscriptions.edit');
    // تعديل/إضافة خصم يتطلب إذن الخصم المستقل (7.9)
    if (body.discount) {
      await requirePermission(user, 'subscriptions.apply_discount');
    }
    const updated = await subscriptionService.update(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});
