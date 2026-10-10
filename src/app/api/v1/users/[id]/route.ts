import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { userService } from '@/modules/users/service';
import {
  deleteBodySchema,
  updateUserSchema,
  userParamsSchema,
  userRoleSchema,
  userStatusSchema,
} from '@/modules/users/schema';

/** جسم PATCH: حقول أساسية + دور/حالة اختياريان (تفرّع العملية في المسار). */
const patchUserSchema = updateUserSchema.extend({
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
});

export const GET = apiRoute({
  params: userParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'users.manage');
    return { data: await userService.getById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: userParamsSchema,
  body: patchUserSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'users.manage');
    const meta = { user, requestId, ip, userAgent };
    const { role, status, ...rest } = body;

    if (role !== undefined) {
      const changed = await userService.changeRole(params.id, { role, version: body.version }, meta);
      if (status !== undefined) {
        // بعد تغيير الدور تُزاد النسخة 1 — نستخدم نسخة السجل المحدَّث
        const updated = await userService.setStatus(params.id, { status, version: changed.version }, meta);
        return { data: updated };
      }
      return { data: changed };
    }
    if (status !== undefined) {
      return { data: await userService.setStatus(params.id, { status, version: body.version }, meta) };
    }
    return { data: await userService.update(params.id, rest, meta) };
  },
});

export const DELETE = apiRoute({
  params: userParamsSchema,
  body: deleteBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'users.manage');
    const result = await userService.remove(params.id, body.version, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
