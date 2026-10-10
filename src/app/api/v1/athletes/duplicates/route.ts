import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { athleteService } from '@/modules/athletes/service';
import { athleteDuplicatesQuerySchema } from '@/modules/athletes/schema';

/** GET /api/v1/athletes/duplicates — كشف الرياضيين المكررين (اسم + ميلاد + هواتف). */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'athletes.view');
    const query = athleteDuplicatesQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    return { data: await athleteService.findDuplicates(query) };
  },
});
