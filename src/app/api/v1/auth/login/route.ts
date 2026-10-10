import { apiRoute } from '@/shared/api/route';
import { authService } from '@/modules/auth/service';
import { loginSchema } from '@/modules/auth/schema';

/** POST /api/v1/auth/login — عام (بدون مصادقة). حماية Brute-Force داخل الخدمة. */
export const POST = apiRoute({
  auth: false,
  body: loginSchema,
  handler: async ({ body, requestId, ip, userAgent }) => {
    const result = await authService.login(body, { user: null, requestId, ip, userAgent });
    // لا يُعاد الرمز في الجسم — الجلسة عبر كوكي httpOnly (6.1)
    return { data: { user: result.user, mustChangePassword: result.mustChangePassword } };
  },
});
