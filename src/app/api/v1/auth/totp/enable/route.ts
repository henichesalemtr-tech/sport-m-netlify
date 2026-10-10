import { apiRoute } from '@/shared/api/route';
import { authService } from '@/modules/auth/service';
import { enableTotpSchema } from '@/modules/auth/schema';

/** POST /api/v1/auth/totp/enable — التحقق من الرمز مقابل السر ثم تفعيل TOTP. */
export const POST = apiRoute({
  body: enableTotpSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await authService.enableTotp(body, { user, sessionId: user.sessionId, requestId, ip, userAgent });
    return { data: { success: true } };
  },
});
