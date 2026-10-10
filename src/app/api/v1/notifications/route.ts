import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { notificationService } from '@/modules/notifications/service';
import { notificationListQuerySchema } from '@/modules/notifications/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'notifications.view');
    const query = notificationListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await notificationService.list(user, query);
    return {
      data: result.items,
      meta: {
        total: result.total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
        unreadCount: result.unreadCount,
      },
    };
  },
});
