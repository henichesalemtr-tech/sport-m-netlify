import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { subscriptionService } from '@/modules/subscriptions/service';
import {
  renewSubscriptionSchema,
  subscriptionParamsSchema,
} from '@/modules/subscriptions/schema';

export const POST = apiRoute({
  params: subscriptionParamsSchema,
  body: renewSubscriptionSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'subscriptions.create');
    if (body.discount) {
      await requirePermission(user, 'subscriptions.apply_discount');
    }
    const renewed = await subscriptionService.renew(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: renewed };
  },
});
