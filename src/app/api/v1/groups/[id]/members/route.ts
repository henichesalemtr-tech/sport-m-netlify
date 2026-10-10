import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { groupService } from '@/modules/groups/service';
import {
  addMemberSchema,
  groupParamsSchema,
  memberListQuerySchema,
  removeMemberSchema,
} from '@/modules/groups/schema';

export const GET = apiRoute({
  params: groupParamsSchema,
  handler: async ({ req, user, params }) => {
    await requirePermission(user, 'groups.view');
    const query = memberListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await groupService.listMembers(params.id, query, user);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  params: groupParamsSchema,
  body: addMemberSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'groups.manage_members');
    const result = await groupService.addMember(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return {
      data: result.member,
      meta: { capacity: result.capacity, warnings: result.warnings },
    };
  },
});

export const DELETE = apiRoute({
  params: groupParamsSchema,
  body: removeMemberSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'groups.manage_members');
    const result = await groupService.removeMember(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
