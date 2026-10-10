import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { parentService } from '@/modules/parents/service';
import { createParentSchema, parentListQuerySchema } from '@/modules/parents/schema';

/** GET /api/v1/parents — قائمة الأولياء. */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'parents.view');
    const query = parentListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const result = await parentService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

/** POST /api/v1/parents — إنشاء ولي أمر (كشف التكرار بالهاتف + روابط الأبناء). */
export const POST = apiRoute({
  body: createParentSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'parents.create');
    const created = await parentService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
