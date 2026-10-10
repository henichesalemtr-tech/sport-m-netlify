import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { dashboardService } from '@/modules/dashboard/service';
import { financialQuerySchema } from '@/modules/dashboard/schema';

/** الملخص المالي للوحة التحكم — يتطلب صلاحية الاطلاع المالي. */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'reports.view');
    await requirePermission(user, 'reports.view_finance');
    const query = financialQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const data = await dashboardService.financial(user, query);
    return { data };
  },
});
