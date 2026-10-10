/**
 * سجل التدقيق — قراءة فقط (6.5). لا إنشاء/تعديل/حذف عبر هذه الوحدة؛
 * الكتابة تتم حصراً عبر writeAudit داخل معاملات الوحدات الأخرى.
 */
import { auditLogRepository, type AuditLogWithUser } from './repository';
import type { AuditLogListQuery } from './schema';

export interface AuditLogDto {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: Date;
}

function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function toDto(row: AuditLogWithUser): AuditLogDto {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user ? row.user.fullName : null,
    userEmail: row.user ? row.user.email : null,
    userRole: row.user ? row.user.role : null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    requestId: row.requestId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    before: parseJson(row.before),
    after: parseJson(row.after),
    metadata: parseJson(row.metadata),
    createdAt: row.createdAt,
  };
}

export const auditLogService = {
  async list(query: AuditLogListQuery): Promise<{ items: AuditLogDto[]; total: number }> {
    const result = await auditLogRepository.list(query);
    return { items: result.items.map(toDto), total: result.total };
  },
};
