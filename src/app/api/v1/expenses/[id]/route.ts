import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { expenseService } from '@/modules/expenses/service';
import { updateExpenseSchema, expenseParamsSchema } from '@/modules/expenses/schema';

export const GET = apiRoute({
  params: expenseParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'expenses.view');
    return { data: await expenseService.getById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: expenseParamsSchema,
  body: updateExpenseSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'expenses.edit');
    const updated = await expenseService.update(params.id, body, { user, requestId, ip, userAgent });
    return { data: updated };
  },
});
