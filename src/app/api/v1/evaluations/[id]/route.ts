import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { evaluationService } from '@/modules/evaluations/service';
import { evaluationParamsSchema, updateEvaluationSchema } from '@/modules/evaluations/schema';

export const GET = apiRoute({
  params: evaluationParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'evaluations.view');
    return { data: await evaluationService.getById(params.id, user) };
  },
});

export const PATCH = apiRoute({
  params: evaluationParamsSchema,
  body: updateEvaluationSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'evaluations.edit');
    const updated = await evaluationService.update(params.id, body, user, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: evaluationParamsSchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    await requirePermission(user, 'evaluations.edit');
    const result = await evaluationService.remove(params.id, user, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
