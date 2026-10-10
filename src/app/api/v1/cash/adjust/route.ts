import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { cashService } from '@/modules/cash/service';
import { adjustCashSchema } from '@/modules/cash/schema';

export const POST = apiRoute({
  body: adjustCashSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'cash.adjust');
    const entry = await cashService.adjust(body, { user, requestId, ip, userAgent });
    return { data: entry };
  },
});
