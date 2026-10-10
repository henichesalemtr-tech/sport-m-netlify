import { prisma } from '@/shared/db/client';
import type { AuditAction } from '@prisma/client';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * تسجيل حدث في Audit Log (6.5). الجدول Append-Only — لا UPDATE/DELETE.
 * لا PII في السجل إلا قيم قبل/بعد للكيانات الحساسة المصرّح بها.
 * يجب استدعاؤها داخل نفس Transaction للعمليات المالية.
 */
export async function writeAudit(entry: AuditEntry, tx: typeof prisma | object = prisma): Promise<void> {
  const client = tx as typeof prisma;
  await client.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      requestId: entry.requestId,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      before: entry.before === undefined ? undefined : JSON.stringify(entry.before),
      after: entry.after === undefined ? undefined : JSON.stringify(entry.after),
      metadata: entry.metadata === undefined ? undefined : JSON.stringify(entry.metadata),
    },
  });
}

/** تجريد قيم كيان حساس قبل المقارنة (إزالة الحقول شديدة الحساسية من السجل). */
export function sanitizeForAudit<T extends Record<string, unknown>>(
  obj: T,
  redactKeys: string[] = ['passwordHash', 'totpSecret', 'totpSecretHash', 'scanCodeHash', 'tokenHash'],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = redactKeys.includes(k) ? '[REDACTED]' : v;
  }
  return out;
}
