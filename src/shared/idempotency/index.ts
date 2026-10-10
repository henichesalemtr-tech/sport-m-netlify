import { prisma } from '@/shared/db/client';
import { AppError, ErrorCode } from '@/shared/errors';

/**
 * منع تكرار العمليات الحساسة (4.3 / 7.11).
 * يُمرَّر Idempotency-Key في الترويسة؛ يُخزَّن مع النتيجة. عند التكرار تُعاد نفس النتيجة.
 * التنفيذ الفعلي يعتمد على قيد فريد في الجدول المعني (payment.idempotencyKey ...).
 */
export interface IdempotencyRecord {
  key: string;
  entityType: string;
  entityId: string;
  responseHash: string;
}

export function readIdempotencyKey(req: Request): string | undefined {
  const key = req.headers.get('idempotency-key');
  if (!key) return undefined;
  if (key.length < 8 || key.length > 128) {
    throw new AppError(ErrorCode.VALIDATION, 'Idempotency-Key غير صالح');
  }
  return key;
}

/**
 * محاولة حجز مفتاح idempotency لسجل مالي. تُستخدم داخل Transaction.
 * إذا وُجد قيد فريد منتهك (P2002) فالمعالج يعيد النتيجة السابقة بدل التنفيذ مرتين.
 */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: string }).code === 'P2002'
  );
}

export { prisma };
