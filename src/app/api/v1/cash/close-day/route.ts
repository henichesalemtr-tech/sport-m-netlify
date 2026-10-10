import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { cashService } from '@/modules/cash/service';
import { closeDaySchema } from '@/modules/cash/schema';

export const POST = apiRoute({
  body: closeDaySchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'cash.close_day');
    const closing = await cashService.closeDay(body, { user, requestId, ip, userAgent });
    return { data: closing };
  },
});
