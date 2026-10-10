import type { AuditLog, Prisma } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { pagination, toOrderBy } from '@/shared/api/query';
import { parseDateOnly } from '@/shared/dates';
import type { AuditLogListQuery } from './schema';

const SORTABLE = ['createdAt', 'action', 'entityType'];

export type AuditLogWithUser = AuditLog & {
  user: { id: string; fullName: string; email: string; role: string } | null;
};

const INCLUDE = {
  user: { select: { id: true, fullName: true, email: true, role: true } },
} satisfies Prisma.AuditLogInclude;

function buildWhere(query: AuditLogListQuery): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (query.action) where.action = query.action;
  if (query.entityType) where.entityType = query.entityType;
  if (query.entityId) where.entityId = query.entityId;
  if (query.userId) where.userId = query.userId;
  if (query.requestId) where.requestId = query.requestId;
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = parseDateOnly(query.dateFrom);
    if (query.dateTo) {
      const end = parseDateOnly(query.dateTo);
      end.setUTCHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  if (query.q) {
    where.OR = [
      { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
      { user: { email: { contains: query.q, mode: 'insensitive' } } },
      { entityType: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/** قراءة فقط — الجدول Append-Only (لا UPDATE/DELETE حتى للتطبيق). */
export const auditLogRepository = {
  async list(query: AuditLogListQuery): Promise<{ items: AuditLogWithUser[]; total: number }> {
    const where = buildWhere(query);
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        include: INCLUDE,
        orderBy: orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  },
};
