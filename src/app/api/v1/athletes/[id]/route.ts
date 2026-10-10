import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { athleteService } from '@/modules/athletes/service';
import {
  athleteParamsSchema,
  deleteAthleteBodySchema,
  updateAthleteSchema,
} from '@/modules/athletes/schema';

/** GET /api/v1/athletes/[id] — التفاصيل (الحقول الحساسة تُحجب بلا صلاحية). */
export const GET = apiRoute({
  params: athleteParamsSchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    await requirePermission(user, 'athletes.view');
    return { data: await athleteService.getById(params.id, user, { user, requestId, ip, userAgent }) };
  },
});

/** PATCH /api/v1/athletes/[id] — تحديث بتحقق Version. */
export const PATCH = apiRoute({
  params: athleteParamsSchema,
  body: updateAthleteSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'athletes.edit');
    const updated = await athleteService.update(params.id, body, user, { user, requestId, ip, userAgent });
    return { data: updated };
  },
});

/** DELETE /api/v1/athletes/[id] — حذف مرن. */
export const DELETE = apiRoute({
  params: athleteParamsSchema,
  body: deleteAthleteBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'athletes.delete');
    return { data: await athleteService.remove(params.id, body.version, { user, requestId, ip, userAgent }) };
  },
});
