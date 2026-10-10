import { apiRoute } from '@/shared/api/route';
import { authService } from '@/modules/auth/service';
import { changePasswordSchema } from '@/modules/auth/schema';

/** POST /api/v1/auth/change-password — تغيير كلمة مرور صاحب الحساب. */
export const POST = apiRoute({
  body: changePasswordSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await authService.changePassword(body, { user, sessionId: user.sessionId, requestId, ip, userAgent });
    return { data: { success: true } };
  },
});
