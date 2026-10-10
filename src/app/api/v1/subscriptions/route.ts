import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { subscriptionService } from '@/modules/subscriptions/service';
import {
  createSubscriptionSchema,
  subscriptionListQuerySchema,
} from '@/modules/subscriptions/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'subscriptions.view');
    const query = subscriptionListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await subscriptionService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createSubscriptionSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'subscriptions.create');
    // الخصم يتطلب إذنًا مستقلًا (7.9)
    if (body.discount) {
      await requirePermission(user, 'subscriptions.apply_discount');
    }
    const created = await subscriptionService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
