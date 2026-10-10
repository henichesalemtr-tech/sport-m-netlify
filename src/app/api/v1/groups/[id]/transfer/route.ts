import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { groupService } from '@/modules/groups/service';
import { groupParamsSchema, transferMemberSchema } from '@/modules/groups/schema';

/** POST /api/v1/groups/[id]/transfer — تحويل ذري لعضو من هذه المجموعة إلى أخرى. */
export const POST = apiRoute({
  params: groupParamsSchema,
  body: transferMemberSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'groups.manage_members');
    const result = await groupService.transfer(params.id, body, {
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
