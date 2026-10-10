import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { dashboardService } from '@/modules/dashboard/service';

/** المقاييس العامة للوحة التحكم (حقيقية من قاعدة البيانات فقط). */
export const GET = apiRoute({
  handler: async ({ user }) => {
    await requirePermission(user, 'reports.view');
    const data = await dashboardService.general(user);
    return { data };
  },
});
