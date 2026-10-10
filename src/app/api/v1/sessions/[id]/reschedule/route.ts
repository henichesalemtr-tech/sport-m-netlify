import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { sessionService } from '@/modules/sessions/service';
import { rescheduleSessionSchema, sessionParamsSchema } from '@/modules/sessions/schema';

/** POST /api/v1/sessions/[id]/reschedule — إعادة جدولة حصة + إشعار (dedupeKey). */
export const POST = apiRoute({
  params: sessionParamsSchema,
  body: rescheduleSessionSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sessions.edit');
    const result = await sessionService.reschedule(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
