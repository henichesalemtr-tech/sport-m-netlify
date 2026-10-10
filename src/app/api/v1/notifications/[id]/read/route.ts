import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { notificationService } from '@/modules/notifications/service';
import { notificationParamsSchema } from '@/modules/notifications/schema';

export const POST = apiRoute({
  params: notificationParamsSchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    await requirePermission(user, 'notifications.view');
    const result = await notificationService.markRead(params.id, user, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
