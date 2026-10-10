import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { sessionService } from '@/modules/sessions/service';
import { generateSessionsSchema } from '@/modules/sessions/schema';

/** POST /api/v1/sessions/generate — توليد الحصص المتكررة لمجموعة ضمن نافذة متدحرجة. */
export const POST = apiRoute({
  body: generateSessionsSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sessions.create');
    const result = await sessionService.generate(body, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
