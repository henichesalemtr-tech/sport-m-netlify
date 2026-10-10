import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { evaluationService } from '@/modules/evaluations/service';
import {
  createEvaluationTemplateSchema,
  evaluationTemplateListQuerySchema,
} from '@/modules/evaluations/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'evaluations.view');
    const query = evaluationTemplateListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await evaluationService.listTemplates(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createEvaluationTemplateSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    // إدارة القوالب امتياز إداري — نستخدم صلاحية إنشاء التقييمات مع نطاق موسّع:
    // المدرب يملك evaluations.create لكن القوالب تُدار إداريًا (يُضبط عبر تخصيص الصلاحيات)
    await requirePermission(user, 'sports.manage');
    const created = await evaluationService.createTemplate(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
