import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { receiptService } from '@/modules/receipts/service';
import { receiptParamsSchema } from '@/modules/receipts/schema';

export const POST = apiRoute({
  params: receiptParamsSchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    await requirePermission(user, 'payments.reprint_receipt');
    const receipt = await receiptService.reprint(params.id, { user, requestId, ip, userAgent });
    return { data: receipt };
  },
});
