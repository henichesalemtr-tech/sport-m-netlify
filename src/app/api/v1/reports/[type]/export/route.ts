import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { toErrorResponse } from '@/shared/api/route';
import { requireSession } from '@/shared/auth/session';
import { requirePermission } from '@/shared/permissions/guard';
import { contentDisposition } from '@/shared/export/csv';
import { reportService } from '@/modules/reports/service';
import { reportParamsSchema, reportExportQuerySchema } from '@/modules/reports/schema';

/**
 * تصدير تقرير — GET /api/v1/reports/{type}/export?format=csv|xlsx
 * CSV يُبَثّ (ReadableStream) للتعامل مع الصادرات الكبيرة؛ XLSX يُبنى كاملًا.
 * التفويض: reports.export (+ reports.view_finance للتقارير المالية). Audit EXPORT داخل الخدمة.
 */
export async function GET(
  req: Request,
  { params }: { params: { type: string } },
): Promise<NextResponse> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;
  try {
    const user = await requireSession();
    const parsed = reportParamsSchema.parse(params);
    await requirePermission(user, 'reports.export');
    if (reportService.isFinanceReport(parsed.type)) {
      await requirePermission(user, 'reports.view_finance');
    }
    const query = reportExportQuerySchema.parse(
      Object.fromEntries(new URL(req.url).searchParams.entries()),
    );
    const file = await reportService.exportReport(parsed.type, query, user, {
      user,
      requestId,
      ip,
      userAgent,
    });
    const body = file.stream ?? new Uint8Array(file.bytes ?? Buffer.alloc(0));
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': file.mimeType,
        'content-disposition': contentDisposition(file.fileName),
        'cache-control': 'private, no-store',
        'x-request-id': requestId,
      },
    });
  } catch (e) {
    return toErrorResponse(e, requestId);
  }
}
