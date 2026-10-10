import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { evaluationService } from '@/modules/evaluations/service';
import { evaluationGroupParamsSchema } from '@/modules/evaluations/schema';

/** تقرير المقارنة الجماعية — GET /api/v1/evaluations/group/{groupId} */
export const GET = apiRoute({
  params: evaluationGroupParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'evaluations.view');
    return { data: await evaluationService.groupComparison(params.groupId, user) };
  },
});
