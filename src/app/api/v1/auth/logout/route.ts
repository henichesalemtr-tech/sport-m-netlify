import { apiRoute } from '@/shared/api/route';
import { authService } from '@/modules/auth/service';

/** POST /api/v1/auth/logout — إبطال الجلسة الحالية. */
export const POST = apiRoute({
  handler: async ({ user, requestId, ip, userAgent }) => {
    await authService.logout({ user, sessionId: user.sessionId, requestId, ip, userAgent });
    return { data: { success: true } };
  },
});
