import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { ageCategoryService } from '@/modules/age-categories/service';
import {
  ageCategoryListQuerySchema,
  createAgeCategorySchema,
} from '@/modules/age-categories/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'age_categories.view');
    const query = ageCategoryListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await ageCategoryService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createAgeCategorySchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'age_categories.manage');
    const created = await ageCategoryService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
