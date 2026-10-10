import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { userService } from '@/modules/users/service';
import { createUserSchema, userListQuerySchema } from '@/modules/users/schema';

/** GET /api/v1/users — قائمة المستخدمين. */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'users.manage');
    const query = userListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const result = await userService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

/** POST /api/v1/users — إنشاء مستخدم. */
export const POST = apiRoute({
  body: createUserSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'users.manage');
    const created = await userService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
