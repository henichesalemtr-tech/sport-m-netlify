import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { expenseCategoryService } from '@/modules/expenses/service';
import { createExpenseCategorySchema } from '@/modules/expenses/schema';

export const GET = apiRoute({
  handler: async ({ user }) => {
    await requirePermission(user, 'expenses.view');
    return { data: await expenseCategoryService.list() };
  },
});

export const POST = apiRoute({
  body: createExpenseCategorySchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'expenses.create');
    const created = await expenseCategoryService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
