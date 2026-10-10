import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { athleteService } from '@/modules/athletes/service';
import { athleteParamsSchema } from '@/modules/athletes/schema';

/** GET /api/v1/athletes/[id]/profile — الملف الشخصي الكامل (اشتراكات/مدفوعات/حضور/مجموعات/تقييمات/وثائق/خط زمني). */
export const GET = apiRoute({
  params: athleteParamsSchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    await requirePermission(user, 'athletes.view');
    const profile = await athleteService.profile(params.id, user, { user, requestId, ip, userAgent });
    return { data: profile };
  },
});
