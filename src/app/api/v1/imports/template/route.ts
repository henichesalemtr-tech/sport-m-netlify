import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { toErrorResponse } from '@/shared/api/route';
import { requireSession } from '@/shared/auth/session';
import { requirePermission } from '@/shared/permissions/guard';
import { contentDisposition } from '@/shared/export/csv';
import { importService } from '@/modules/imports/service';
import { getEntityDef } from '@/modules/imports/entities';
import { validationError } from '@/shared/errors';
import { templateQuerySchema } from '@/modules/imports/schema';

/** قالب استيراد CSV قابل للتنزيل — GET /api/v1/imports/template?entityType=athlete */
export async function GET(req: Request): Promise<NextResponse> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  try {
    const user = await requireSession();
    const query = templateQuerySchema.parse(
      Object.fromEntries(new URL(req.url).searchParams.entries()),
    );
    const def = getEntityDef(query.entityType);
    if (!def) throw validationError({ entityType: ['نوع كيان غير مدعوم'] });
    await requirePermission(user, def.permission);

    const template = await importService.template(query.entityType);
    const bytes = new TextEncoder().encode(template.csv);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': contentDisposition(template.fileName),
        'cache-control': 'private, no-store',
        'x-request-id': requestId,
      },
    });
  } catch (e) {
    return toErrorResponse(e, requestId);
  }
}
