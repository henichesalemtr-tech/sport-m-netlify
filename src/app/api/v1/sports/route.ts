import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { sportService } from '@/modules/sports/service';
import { createSportSchema, sportListQuerySchema } from '@/modules/sports/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'sports.view');
    // معاملات القائمة تُقرأ من Query String (apiRoute يتحقق من params المسار فقط)
    const query = sportListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await sportService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createSportSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sports.manage');
    const created = await sportService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
