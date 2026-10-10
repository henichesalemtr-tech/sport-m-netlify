import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { documentService } from '@/modules/documents/service';
import {
  documentTypeParamsSchema,
  updateDocumentTypeSchema,
} from '@/modules/documents/schema';

export const GET = apiRoute({
  params: documentTypeParamsSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'documents.view');
    return { data: await documentService.getTypeById(params.id) };
  },
});

export const PATCH = apiRoute({
  params: documentTypeParamsSchema,
  body: updateDocumentTypeSchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'settings.manage');
    const updated = await documentService.updateType(params.id, body, {
      user,
      requestId,
      ip,
      userAgent,
    });
    return { data: updated };
  },
});

export const DELETE = apiRoute({
  params: documentTypeParamsSchema,
  handler: async ({ user, params, requestId, ip, userAgent }) => {
    await requirePermission(user, 'settings.manage');
    const result = await documentService.removeType(params.id, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
