import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { settingsService } from '@/modules/settings/service';
import { settingsGroupQuerySchema } from '@/modules/settings/schema';

/** GET /api/v1/settings?group= — قائمة الإعدادات (أو مجموعة). */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'settings.manage');
    const query = settingsGroupQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    return { data: await settingsService.list(query) };
  },
});
