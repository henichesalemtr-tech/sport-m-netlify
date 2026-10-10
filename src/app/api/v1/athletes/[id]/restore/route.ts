import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { athleteService } from '@/modules/athletes/service';
import { athleteParamsSchema, restoreAthleteBodySchema } from '@/modules/athletes/schema';

/** POST /api/v1/athletes/[id]/restore — استعادة رياضي محذوف (Soft Delete). */
export const POST = apiRoute({
  params: athleteParamsSchema,
  body: restoreAthleteBodySchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    await requirePermission(user, 'athletes.restore');
    const result = await athleteService.restore(params.id, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
