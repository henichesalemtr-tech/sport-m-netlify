import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { evaluationService } from '@/modules/evaluations/service';
import { createEvaluationSchema, evaluationListQuerySchema } from '@/modules/evaluations/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'evaluations.view');
    const query = evaluationListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await evaluationService.list(user, query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createEvaluationSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'evaluations.create');
    const created = await evaluationService.create(body, user, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
