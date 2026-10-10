import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { ageCategoryService } from '@/modules/age-categories/service';
import { suggestQuerySchema } from '@/modules/age-categories/schema';

/** GET /api/v1/age-categories/suggest?birthDate=YYYY-MM-DD — اقتراح الفئة من تاريخ الميلاد. */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'age_categories.view');
    const query = suggestQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    return { data: await ageCategoryService.suggest(query) };
  },
});
