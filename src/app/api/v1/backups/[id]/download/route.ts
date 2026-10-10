import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { toErrorResponse } from '@/shared/api/route';
import { requireSession } from '@/shared/auth/session';
import { requirePermission } from '@/shared/permissions/guard';
import { contentDisposition } from '@/shared/export/csv';
import { backupService } from '@/modules/backups/service';
import { backupParamsSchema } from '@/modules/backups/schema';

/** تنزيل نسخة احتياطية — استجابة ثنائية، backup.manage فقط. */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;
  try {
    const user = await requireSession();
    await requirePermission(user, 'backup.manage');
    const parsed = backupParamsSchema.parse(params);
    const file = await backupService.download(parsed.id, { user, requestId, ip, userAgent });
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(file.sizeBytes),
        'content-disposition': contentDisposition(file.fileName),
        'cache-control': 'private, no-store',
        'x-request-id': requestId,
      },
    });
  } catch (e) {
    return toErrorResponse(e, requestId);
  }
}
