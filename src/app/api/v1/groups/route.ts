import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { groupService } from '@/modules/groups/service';
import { createGroupSchema, groupListQuerySchema } from '@/modules/groups/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'groups.view');
    const query = groupListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    // نطاق البيانات: المدرب المقيّد يرى مجموعاته فقط (يُطبَّق في الـ Repository)
    const result = await groupService.list(query, user);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createGroupSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'groups.create');
    const created = await groupService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
