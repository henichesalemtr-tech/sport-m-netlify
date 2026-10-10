import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { cashService } from '@/modules/cash/service';
import { cashClosingListQuerySchema } from '@/modules/cash/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'cash.view');
    const query = cashClosingListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await cashService.listClosings(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});
