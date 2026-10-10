import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { reportService } from '@/modules/reports/service';
import { reportParamsSchema, reportQuerySchema } from '@/modules/reports/schema';

/** تقرير JSON مرقّم — GET /api/v1/reports/{type} */
export const GET = apiRoute({
  params: reportParamsSchema,
  handler: async ({ req, user, params }) => {
    await requirePermission(user, 'reports.view');
    if (reportService.isFinanceReport(params.type)) {
      await requirePermission(user, 'reports.view_finance');
    }
    const query = reportQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await reportService.getReport(params.type, query, user);
    return {
      data: result.rows,
      meta: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
        columns: result.columns,
        reportType: result.type,
        ...(result.summary ? { summary: result.summary } : {}),
      },
    };
  },
});
