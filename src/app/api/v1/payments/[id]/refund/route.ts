import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { paymentService } from '@/modules/payments/service';
import { refundPaymentSchema, paymentParamsSchema } from '@/modules/payments/schema';

export const POST = apiRoute({
  params: paymentParamsSchema,
  body: refundPaymentSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'payments.refund');
    const result = await paymentService.refund(params.id, body, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
