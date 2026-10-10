import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { venueService } from '@/modules/venues/service';
import { createVenueSchema, venueListQuerySchema } from '@/modules/venues/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'venues.view');
    const query = venueListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await venueService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createVenueSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'venues.manage');
    const created = await venueService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
