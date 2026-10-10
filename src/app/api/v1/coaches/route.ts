import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { coachService } from '@/modules/coaches/service';
import { coachListQuerySchema, createCoachSchema } from '@/modules/coaches/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'coaches.view');
    const query = coachListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await coachService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createCoachSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'coaches.create');
    const created = await coachService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
