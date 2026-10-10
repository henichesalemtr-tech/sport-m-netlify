import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { toErrorResponse } from '@/shared/api/route';
import { requireSession } from '@/shared/auth/session';
import { requirePermission } from '@/shared/permissions/guard';
import { contentDisposition } from '@/shared/export/csv';
import { importService } from '@/modules/imports/service';
import { getEntityDef } from '@/modules/imports/entities';
import { validationError } from '@/shared/errors';
import { importParamsSchema } from '@/modules/imports/schema';

/** تنزيل ملف أخطاء الاستيراد — GET /api/v1/imports/{id}/errors */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  try {
    const user = await requireSession();
    const parsed = importParamsSchema.parse(params);
    const job = await importService.getById(parsed.id);
    const def = getEntityDef(job.entityType);
    if (!def) throw validationError({ entityType: ['نوع كيان غير مدعوم'] });
    await requirePermission(user, def.permission);

    const file = await importService.errorsFile(parsed.id);
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': contentDisposition(file.fileName),
        'cache-control': 'private, no-store',
        'x-request-id': requestId,
      },
    });
  } catch (e) {
    return toErrorResponse(e, requestId);
  }
}
