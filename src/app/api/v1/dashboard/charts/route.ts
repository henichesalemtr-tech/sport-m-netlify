import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { dashboardService } from '@/modules/dashboard/service';
import { chartsQuerySchema } from '@/modules/dashboard/schema';

/** سلاسل الرسوم البيانية للوحة التحكم. */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'reports.view');
    const query = chartsQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const data = await dashboardService.charts(user, query);
    return { data };
  },
});
