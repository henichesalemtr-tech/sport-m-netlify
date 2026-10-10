import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { cashService } from '@/modules/cash/service';
import { cashTransactionListQuerySchema } from '@/modules/cash/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'cash.view');
    const query = cashTransactionListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await cashService.listTransactions(query);
    return {
      data: { items: result.items, balance: result.balance },
      meta: {
        total: result.total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
      },
    };
  },
});
