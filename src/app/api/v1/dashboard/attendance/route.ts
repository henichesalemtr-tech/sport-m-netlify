import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { dashboardService } from '@/modules/dashboard/service';

/** ملخص الحضور لليوم مع أعلى المجموعات غيابًا وأحدث سجلات الحضور. */
export const GET = apiRoute({
  handler: async ({ user }) => {
    await requirePermission(user, 'reports.view');
    const data = await dashboardService.attendance(user);
    return { data };
  },
});
