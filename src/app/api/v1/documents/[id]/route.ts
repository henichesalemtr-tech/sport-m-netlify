import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { documentService } from '@/modules/documents/service';
import { documentParamsSchema, updateDocumentSchema } from '@/modules/documents/schema';

export const GET = apiRoute({
  params: documentParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'documents.view');
    return { data: await documentService.getById(params.id, user) };
  },
});

export const PATCH = apiRoute({
  params: documentParamsSchema,
  body: updateDocumentSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'documents.upload');
    const updated = await documentService.updateExpiry(params.id, body, user, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: documentParamsSchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    await requirePermission(user, 'documents.delete');
    const result = await documentService.remove(params.id, user, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: result };
  },
});
