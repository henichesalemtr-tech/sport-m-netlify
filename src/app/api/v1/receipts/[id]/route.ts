import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { receiptService } from '@/modules/receipts/service';
import { receiptParamsSchema } from '@/modules/receipts/schema';

export const GET = apiRoute({
  params: receiptParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'payments.view');
    return { data: await receiptService.getById(params.id) };
  },
});
