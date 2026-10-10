import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { roleService } from '@/modules/roles/service';

/** GET /api/v1/roles — الأدوار + الصلاحيات الفعلية + قائمة كل الصلاحيات. */
export const GET = apiRoute({
  handler: async ({ user }) => {
    await requirePermission(user, 'roles.manage');
    const [roles, permissions] = await Promise.all([
      roleService.listRoles(),
      roleService.listPermissions(),
    ]);
    return { data: { roles, permissions } };
  },
});
