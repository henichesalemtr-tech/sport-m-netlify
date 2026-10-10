import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { documentService } from '@/modules/documents/service';
import {
  createDocumentTypeSchema,
  documentTypeListQuerySchema,
} from '@/modules/documents/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'documents.view');
    const query = documentTypeListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await documentService.listTypes(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

export const POST = apiRoute({
  body: createDocumentTypeSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'settings.manage');
    const created = await documentService.createType(body, { user, requestId, ip, userAgent });
    return { data: created };
  },
});
