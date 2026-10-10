import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { readIdempotencyKey } from '@/shared/idempotency';
import { paymentService } from '@/modules/payments/service';
import { createPaymentSchema, paymentListQuerySchema } from '@/modules/payments/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'payments.view');
    const query = paymentListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await paymentService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createPaymentSchema,
  handler: async ({ req, user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'payments.create');
    // عملية حساسة للتكرار — Idempotency-Key + قيد فريد (4.3 / 7.11)
    const idempotencyKey = readIdempotencyKey(req);
    const result = await paymentService.create(
      body,
      { user, requestId, ip, userAgent },
      idempotencyKey,
    );
    return { data: result, meta: { replayed: result.replayed } };
  },
});
