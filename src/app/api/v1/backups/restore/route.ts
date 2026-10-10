import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { backupService } from '@/modules/backups/service';
import { restoreBackupSchema } from '@/modules/backups/schema';

/** استعادة نسخة — تأكيد مكتوب RESTORE + سبب إلزامي (backup.manage). */
export const POST = apiRoute({
  body: restoreBackupSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'backup.manage');
    const result = await backupService.restore(body, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
