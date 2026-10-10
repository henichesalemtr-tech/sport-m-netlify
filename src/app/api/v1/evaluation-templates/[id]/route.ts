import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { evaluationService } from '@/modules/evaluations/service';
import {
  evaluationTemplateParamsSchema,
  updateEvaluationTemplateSchema,
} from '@/modules/evaluations/schema';

export const GET = apiRoute({
  params: evaluationTemplateParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'evaluations.view');
    return { data: await evaluationService.getTemplateById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: evaluationTemplateParamsSchema,
  body: updateEvaluationTemplateSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sports.manage');
    const updated = await evaluationService.updateTemplate(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: evaluationTemplateParamsSchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    await requirePermission(user, 'sports.manage');
    const result = await evaluationService.removeTemplate(params.id, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
