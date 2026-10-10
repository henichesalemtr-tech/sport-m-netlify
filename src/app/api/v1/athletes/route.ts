import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { athleteService } from '@/modules/athletes/service';
import { athleteListQuerySchema, createAthleteSchema } from '@/modules/athletes/schema';

/** GET /api/v1/athletes — قائمة الرياضيين (بحث عربي متسامح + فلاتر + Pagination). */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'athletes.view');
    const query = athleteListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const result = await athleteService.list(query, user);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

/** POST /api/v1/athletes — تسجيل رياضي (كشف التكرار + توليد رقم التسجيل). */
export const POST = apiRoute({
  body: createAthleteSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'athletes.create');
    const created = await athleteService.create(body, user, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
