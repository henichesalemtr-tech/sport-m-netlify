import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { subscriptionService } from '@/modules/subscriptions/service';
import {
  cancelSubscriptionSchema,
  subscriptionParamsSchema,
} from '@/modules/subscriptions/schema';

export const POST = apiRoute({
  params: subscriptionParamsSchema,
  body: cancelSubscriptionSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'subscriptions.cancel');
    const result = await subscriptionService.cancel(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
