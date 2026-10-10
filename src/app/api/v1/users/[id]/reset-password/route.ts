import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { userService } from '@/modules/users/service';
import { adminResetPasswordSchema, userParamsSchema } from '@/modules/users/schema';

/** POST /api/v1/users/[id]/reset-password — إعادة ضبط كلمة المرور بواسطة مدير. */
export const POST = apiRoute({
  params: userParamsSchema,
  body: adminResetPasswordSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'users.manage');
    await userService.resetPassword(params.id, body.newPassword, { user, requestId, ip, userAgent });
    return { data: { success: true } };
  },
});
