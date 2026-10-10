import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { subscriptionTypeService } from '@/modules/subscription-types/service';
import {
  createSubscriptionTypeSchema,
  subscriptionTypeListQuerySchema,
} from '@/modules/subscription-types/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'subscriptions.view');
    const query = subscriptionTypeListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await subscriptionTypeService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createSubscriptionTypeSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'subscriptions.edit');
    const created = await subscriptionTypeService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
