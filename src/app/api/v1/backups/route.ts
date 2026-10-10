import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { backupService } from '@/modules/backups/service';
import { backupListQuerySchema, createBackupSchema } from '@/modules/backups/schema';

/** Super Admin فقط عبر صلاحية backup.manage. */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'backup.manage');
    const query = backupListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await backupService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createBackupSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'backup.manage');
    const record = await backupService.create({ user, requestId, ip, userAgent }, body);
    return { data: record };
  },
});
