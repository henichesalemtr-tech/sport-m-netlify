import { apiRoute } from '@/shared/api/route';
import { authService } from '@/modules/auth/service';
import { disableTotpSchema } from '@/modules/auth/schema';

/** POST /api/v1/auth/totp/disable — تعطيل TOTP بعد التحقق من رمز حالي. */
export const POST = apiRoute({
  body: disableTotpSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await authService.disableTotp(body, { user, sessionId: user.sessionId, requestId, ip, userAgent });
    return { data: { success: true } };
  },
});
