import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { parentService } from '@/modules/parents/service';
import { deleteParentBodySchema, parentParamsSchema, updateParentSchema } from '@/modules/parents/schema';

/** GET /api/v1/parents/[id] — الملف الشخصي: الولي + الأبناء + إجمالي الديون. */
export const GET = apiRoute({
  params: parentParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'parents.view');
    return { data: await parentService.getProfile(params.id) };
  },
});

/** PATCH /api/v1/parents/[id] — تحديث بتحقق Version (+ استبدال روابط الأبناء). */
export const PATCH = apiRoute({
  params: parentParamsSchema,
  body: updateParentSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'parents.edit');
    const updated = await parentService.update(params.id, body, { user, requestId, ip, userAgent });
    return { data: updated };
  },
});

/** DELETE /api/v1/parents/[id] — حذف مرن (يُمنع مع وجود أبناء مرتبطين). */
export const DELETE = apiRoute({
  params: parentParamsSchema,
  body: deleteParentBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'parents.delete');
    return { data: await parentService.remove(params.id, body.version, { user, requestId, ip, userAgent }) };
  },
});
