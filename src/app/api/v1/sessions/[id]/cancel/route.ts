import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { sessionService } from '@/modules/sessions/service';
import { cancelSessionSchema, sessionParamsSchema } from '@/modules/sessions/schema';

/** POST /api/v1/sessions/[id]/cancel — إلغاء حصة + إشعار (dedupeKey). */
export const POST = apiRoute({
  params: sessionParamsSchema,
  body: cancelSessionSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sessions.edit');
    const result = await sessionService.cancel(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
