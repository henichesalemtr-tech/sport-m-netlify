import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { sessionService } from '@/modules/sessions/service';
import { createSessionSchema, sessionListQuerySchema } from '@/modules/sessions/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'sessions.view');
    const query = sessionListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await sessionService.list(query, user);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createSessionSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sessions.create');
    const created = await sessionService.create(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
