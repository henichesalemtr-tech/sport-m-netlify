import { apiRoute } from '@/shared/api/route';
import { requirePermission, type AuthContext } from '@/shared/permissions/guard';
import { validationError } from '@/shared/errors';
import { importService } from '@/modules/imports/service';
import { getEntityDef } from '@/modules/imports/entities';
import { importParamsSchema, saveMappingSchema } from '@/modules/imports/schema';

async function requireEntityPermission(user: AuthContext, jobId: string): Promise<void> {
  const job = await importService.getById(jobId);
  const def = getEntityDef(job.entityType);
  if (!def) throw validationError({ entityType: ['نوع كيان غير مدعوم'] });
  await requirePermission(user, def.permission);
}

export const GET = apiRoute({
  params: importParamsSchema,
  handler: async ({ user, params }) => {
    await requireEntityPermission(user, params.id);
    return { data: await importService.getMappingInfo(params.id) };
  },
});

export const POST = apiRoute({
  params: importParamsSchema,
  body: saveMappingSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requireEntityPermission(user, params.id);
    const job = await importService.saveMapping(params.id, body, { user, requestId, ip, userAgent });
    return { data: job };
  },
});
