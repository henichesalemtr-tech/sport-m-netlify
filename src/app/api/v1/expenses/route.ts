import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { expenseService } from '@/modules/expenses/service';
import { createExpenseSchema, expenseListQuerySchema } from '@/modules/expenses/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'expenses.view');
    const query = expenseListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await expenseService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createExpenseSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'expenses.create');
    const created = await expenseService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
