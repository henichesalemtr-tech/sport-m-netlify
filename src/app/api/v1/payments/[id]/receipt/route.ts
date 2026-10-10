import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { receiptService } from '@/modules/receipts/service';
import { paymentParamsSchema } from '@/modules/payments/schema';

/** وصل الدفعة — يعرض "ملغى" إذا كانت الدفعة ملغاة (status VOIDED). */
export const GET = apiRoute({
  params: paymentParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'payments.view');
    return { data: await receiptService.getByPaymentId(params.id) };
  },
});
