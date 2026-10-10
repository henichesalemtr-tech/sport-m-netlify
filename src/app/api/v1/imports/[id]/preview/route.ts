import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { validationError } from '@/shared/errors';
import { importService } from '@/modules/imports/service';
import { getEntityDef } from '@/modules/imports/entities';
import { importParamsSchema, previewQuerySchema } from '@/modules/imports/schema';

export const GET = apiRoute({
  params: importParamsSchema,
  handler: async ({ req, user, params, requestId, ip, userAgent }) => {
    const job = await importService.getById(params.id);
    const def = getEntityDef(job.entityType);
    if (!def) throw validationError({ entityType: ['نوع كيان غير مدعوم'] });
    await requirePermission(user, def.permission);
    const query = previewQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await importService.preview(params.id, query, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
