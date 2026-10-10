import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { auditLogService } from '@/modules/audit-logs/service';
import { auditLogListQuerySchema } from '@/modules/audit-logs/schema';

/** قائمة سجل التدقيق — قراءة فقط لـ audit.view. */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'audit.view');
    const query = auditLogListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await auditLogService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});
