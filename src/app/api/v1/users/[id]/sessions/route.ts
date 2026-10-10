import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { userService } from '@/modules/users/service';
import { revokeSessionsBodySchema, userParamsSchema } from '@/modules/users/schema';

/** GET /api/v1/users/[id]/sessions — الجلسات النشطة للمستخدم. */
export const GET = apiRoute({
  params: userParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'users.manage');
    const sessions = await userService.listSessions(
      params.id,
      params.id === user.userId ? user.sessionId : undefined,
    );
    return { data: sessions };
  },
});

/** DELETE /api/v1/users/[id]/sessions — إبطال جلسة محددة أو كل الجلسات. */
export const DELETE = apiRoute({
  params: userParamsSchema,
  body: revokeSessionsBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'users.manage');
    const result = await userService.revokeSessions(params.id, body, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
