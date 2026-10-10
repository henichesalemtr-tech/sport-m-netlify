import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, ErrorCode, isAppError } from '@/shared/errors';
import { getSession, type AuthContext } from '@/shared/auth/session';
import { randomUUID } from 'node:crypto';

export interface ApiContext<T = unknown> {
  req: Request;
  user: AuthContext & { sessionId: string };
  params: T;
  requestId: string;
  ip?: string;
  userAgent?: string;
}

interface HandlerOptions<TParams, TBody> {
  /** مخطط Zod للتحقق من جسم الطلب (اختياري لـ GET). */
  body?: ZodSchema<TBody>;
  /** مخطط Zod لمعاملات المسار. */
  params?: ZodSchema<TParams>;
  /** هل يتطلب مصادقة (افتراضيًا نعم). */
  auth?: boolean;
  handler: (ctx: ApiContext<TParams> & { body: TBody }) => Promise<unknown>;
}

/**
 * غلاف موحّد لمسارات API (4.2 / 4.3):
 * Authenticate → Validate → (Authorize داخل handler) → Service → رد موحّد.
 * الرد الناجح: { data, meta? } — الفاشل: { error: { code, message, fieldErrors?, requestId } }
 */
export function apiRoute<TParams = Record<string, string>, TBody = unknown>(
  opts: HandlerOptions<TParams, TBody>,
) {
  return async (req: Request, { params }: { params: TParams }): Promise<NextResponse> => {
    const requestId = req.headers.get('x-request-id') ?? randomUUID();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    const userAgent = req.headers.get('user-agent') ?? undefined;

    try {
      let user: (AuthContext & { sessionId: string }) | null = null;
      if (opts.auth !== false) {
        user = await getSession();
        if (!user) {
          throw new AppError(ErrorCode.UNAUTHORIZED, 'يجب تسجيل الدخول');
        }
      }

      let parsedParams = params;
      if (opts.params) parsedParams = opts.params.parse(params);

      let body = undefined as TBody;
      if (opts.body) {
        const raw = req.method === 'GET' || req.method === 'HEAD' ? {} : await req.json().catch(() => ({}));
        body = opts.body.parse(raw);
      }

      const result = await opts.handler({
        req,
        user: user as AuthContext & { sessionId: string },
        params: parsedParams,
        requestId,
        ip,
        userAgent,
        body,
      });

      return NextResponse.json(result ?? { data: null }, { headers: { 'x-request-id': requestId } });
    } catch (e) {
      return toErrorResponse(e, requestId);
    }
  };
}

export function toErrorResponse(e: unknown, requestId: string): NextResponse {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of e.issues) {
      const key = issue.path.join('.') || '_';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return NextResponse.json(
      { error: { code: ErrorCode.VALIDATION, message: 'بيانات غير صالحة', fieldErrors, requestId } },
      { status: 400, headers: { 'x-request-id': requestId } },
    );
  }
  if (isAppError(e)) {
    return NextResponse.json(
      { error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors, requestId } },
      { status: e.status, headers: { 'x-request-id': requestId } },
    );
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(e);
    return NextResponse.json(
      { error: { code: mapped.code, message: mapped.message, requestId } },
      { status: mapped.status, headers: { 'x-request-id': requestId } },
    );
  }
  // خطأ تقني — يُسجَّل ولا يُسرَّب (6.2 / 9.2)
  console.error('[api-error]', { requestId, error: e instanceof Error ? e.message : String(e) });
  return NextResponse.json(
    { error: { code: ErrorCode.INTERNAL, message: 'تعذر تنفيذ العملية، يرجى المحاولة مرة أخرى.', requestId } },
    { status: 500, headers: { 'x-request-id': requestId } },
  );
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError): { code: string; message: string; status: number } {
  switch (e.code) {
    case 'P2002':
      return { code: ErrorCode.DUPLICATE_RECORD, message: 'سجل مكرر — القيمة موجودة مسبقًا', status: 409 };
    case 'P2025':
      return { code: ErrorCode.NOT_FOUND, message: 'السجل غير موجود', status: 404 };
    case 'P2003':
      return { code: ErrorCode.CONFLICT, message: 'تعذّر العملية بسبب ارتباط ببيانات أخرى', status: 409 };
    default:
      return { code: ErrorCode.INTERNAL, message: 'تعذر تنفيذ العملية، يرجى المحاولة مرة أخرى.', status: 500 };
  }
}

/** رد قائمة موحّد مع Pagination (4.3). */
export function paginated<T>(data: T[], total: number, page: number, pageSize: number) {
  return {
    data,
    meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
