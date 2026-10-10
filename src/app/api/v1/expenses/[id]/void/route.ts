import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { expenseService } from '@/modules/expenses/service';
import { voidExpenseSchema, expenseParamsSchema } from '@/modules/expenses/schema';

export const POST = apiRoute({
  params: expenseParamsSchema,
  body: voidExpenseSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    // الإلغاء إزالة مالية — يستعمل إذن الحذف (لا حذف صامت للمصاريف)
    await requirePermission(user, 'expenses.delete');
    const result = await expenseService.void(params.id, body, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
