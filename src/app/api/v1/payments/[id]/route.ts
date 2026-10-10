import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { paymentService } from '@/modules/payments/service';
import { updatePaymentNotesSchema, paymentParamsSchema } from '@/modules/payments/schema';

export const GET = apiRoute({
  params: paymentParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'payments.view');
    return { data: await paymentService.getById(params.id) };
  },
});

/**
 * الدفعة سجل مالي غير قابل للتعديل (7.11) —
 * الحقل الوحيد المسموح تعديله هو الملاحظات (بلا إذن edit مستقل؛ يكفي إذن التسجيل).
 */
export const PATCH = apiRoute({
  params: paymentParamsSchema,
  body: updatePaymentNotesSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'payments.create');
    const updated = await paymentService.updateNotes(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});
