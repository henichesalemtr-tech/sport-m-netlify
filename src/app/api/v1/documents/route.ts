import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { validationError } from '@/shared/errors';
import { documentService } from '@/modules/documents/service';
import {
  documentListQuerySchema,
  uploadDocumentFieldsSchema,
} from '@/modules/documents/schema';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'documents.view');
    const query = documentListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await documentService.list(user, query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

/** رفع وثيقة — multipart/form-data (الحقول: file, athleteId, documentTypeId, expiryDate?). */
export const POST = apiRoute({
  handler: async ({ req, user, requestId, ip, userAgent }) => {
    await requirePermission(user, 'documents.upload');
    const form = await req.formData();
    const file = form.get('file');
    if (file === null || typeof file === 'string') {
      throw validationError({ file: ['الملف مطلوب'] });
    }
    const rawFields: Record<string, unknown> = {};
    for (const key of ['athleteId', 'documentTypeId', 'expiryDate']) {
      const v = form.get(key);
      if (typeof v === 'string' && v.length > 0) rawFields[key] = v;
    }
    const fields = uploadDocumentFieldsSchema.parse(rawFields);
    const buffer = Buffer.from(await file.arrayBuffer());
    const created = await documentService.upload(
      { originalName: file.name, declaredMime: file.type, buffer },
      fields,
      user,
      { user, requestId, ip, userAgent },
    );
    return { data: created };
  },
});
