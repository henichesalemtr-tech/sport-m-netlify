import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { cashService } from '@/modules/cash/service';
import { openingBalanceSchema } from '@/modules/cash/schema';

export const POST = apiRoute({
  body: openingBalanceSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'cash.adjust');
    const entry = await cashService.open(body, { user, requestId, ip, userAgent });
    return { data: entry };
  },
});
