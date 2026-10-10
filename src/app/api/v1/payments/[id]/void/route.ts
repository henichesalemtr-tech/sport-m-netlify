import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { paymentService } from '@/modules/payments/service';
import { voidPaymentSchema, paymentParamsSchema } from '@/modules/payments/schema';

export const POST = apiRoute({
  params: paymentParamsSchema,
  body: voidPaymentSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'payments.void');
    const result = await paymentService.void(params.id, body, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
