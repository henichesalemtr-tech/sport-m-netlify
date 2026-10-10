import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { validationError } from '@/shared/errors';
import { importService } from '@/modules/imports/service';
import { getEntityDef } from '@/modules/imports/entities';
import { confirmImportSchema, importParamsSchema } from '@/modules/imports/schema';

export const POST = apiRoute({
  params: importParamsSchema,
  body: confirmImportSchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    const job = await importService.getById(params.id);
    const def = getEntityDef(job.entityType);
    if (!def) throw validationError({ entityType: ['نوع كيان غير مدعوم'] });
    await requirePermission(user, def.permission);
    const result = await importService.confirm(params.id, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
