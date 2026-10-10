import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { notificationService } from '@/modules/notifications/service';

export const POST = apiRoute({
  handler: async ({ user, requestId, ip, userAgent }) => {
    await requirePermission(user, 'notifications.view');
    const result = await notificationService.markAllRead(user, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
