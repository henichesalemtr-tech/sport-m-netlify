import { z } from 'zod';
import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { evaluationService } from '@/modules/evaluations/service';
import { uuidSchema } from '@/shared/validation/common';

const timeSeriesQuerySchema = z.object({
  athleteId: uuidSchema,
  templateId: uuidSchema.optional(),
});

/** السلسلة الزمنية لتقدم رياضي (رسم بياني) — GET /api/v1/evaluations/time-series?athleteId=... */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'evaluations.view');
    const query = timeSeriesQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await evaluationService.timeSeries(query.athleteId, user, query.templateId);
    return { data: result };
  },
});
