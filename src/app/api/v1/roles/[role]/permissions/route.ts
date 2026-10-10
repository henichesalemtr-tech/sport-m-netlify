import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { roleService } from '@/modules/roles/service';
import { roleParamsSchema, updateRolePermissionsSchema } from '@/modules/roles/schema';

/** GET /api/v1/roles/[role]/permissions — صلاحيات الدور الفعلية وتخصيصاته. */
export const GET = apiRoute({
  params: roleParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'roles.manage');
    return { data: await roleService.getRolePermissions(params.role) };
  },
});

/** PUT /api/v1/roles/[role]/permissions — تحديث تخصيصات صلاحيات الدور. */
export const PUT = apiRoute({
  params: roleParamsSchema,
  body: updateRolePermissionsSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'roles.manage');
    const updated = await roleService.updateRolePermissions(params.role, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});
