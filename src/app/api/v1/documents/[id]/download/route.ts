import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { toErrorResponse } from '@/shared/api/route';
import { requireSession } from '@/shared/auth/session';
import { requirePermission } from '@/shared/permissions/guard';
import { contentDisposition } from '@/shared/export/csv';
import { documentService } from '@/modules/documents/service';
import { documentParamsSchema, downloadQuerySchema } from '@/modules/documents/schema';

/**
 * تنزيل/معاينة وثيقة — استجابة ثنائية (لا تمر عبر NextResponse.json).
 * التفويض: documents.view + نطاق الرياضي (داخل الخدمة). الأخطاء عبر toErrorResponse الموحّد.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  try {
    const user = await requireSession();
    await requirePermission(user, 'documents.view');
    const parsed = documentParamsSchema.parse(params);
    const query = downloadQuerySchema.parse(
      Object.fromEntries(new URL(req.url).searchParams.entries()),
    );
    const file = await documentService.download(parsed.id, user);
    const inline = query.disposition === 'inline';
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'content-type': file.mimeType,
        'content-length': String(file.sizeBytes),
        'content-disposition': contentDisposition(file.originalName, inline),
        'cache-control': 'private, no-store',
        'x-request-id': requestId,
      },
    });
  } catch (e) {
    return toErrorResponse(e, requestId);
  }
}
