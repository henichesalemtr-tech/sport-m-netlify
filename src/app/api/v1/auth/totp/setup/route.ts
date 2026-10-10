import { apiRoute } from '@/shared/api/route';
import { authService } from '@/modules/auth/service';

/**
 * POST /api/v1/auth/totp/setup — توليد سر TOTP خام + رابط otpauth + QR لصاحب الحساب.
 * لا يُخزَّن شيء قبل التحقق في /enable.
 */
export const POST = apiRoute({
  handler: async ({ user, requestId, ip, userAgent }) => {
    const result = await authService.setupTotp({
      user,
      sessionId: user.sessionId,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
