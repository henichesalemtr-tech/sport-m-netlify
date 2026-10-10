import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { subscriptionService } from '@/modules/subscriptions/service';
import {
  resumeSubscriptionSchema,
  subscriptionParamsSchema,
} from '@/modules/subscriptions/schema';

export const POST = apiRoute({
  params: subscriptionParamsSchema,
  body: resumeSubscriptionSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'subscriptions.suspend');
    const result = await subscriptionService.resume(params.id, body.version, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
