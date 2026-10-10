import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { expenseCategoryService } from '@/modules/expenses/service';
import {
  updateExpenseCategorySchema,
  expenseCategoryParamsSchema,
} from '@/modules/expenses/schema';

export const GET = apiRoute({
  params: expenseCategoryParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'expenses.view');
    return { data: await expenseCategoryService.getById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: expenseCategoryParamsSchema,
  body: updateExpenseCategorySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'expenses.edit');
    const updated = await expenseCategoryService.update(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: expenseCategoryParamsSchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    await requirePermission(user, 'expenses.delete');
    const result = await expenseCategoryService.remove(params.id, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
