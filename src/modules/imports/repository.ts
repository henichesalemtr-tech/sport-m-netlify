import type { ImportJob, Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { pagination, toOrderBy } from '@/shared/api/query';
import type { ImportListQuery } from './schema';

type Db = typeof prisma | PrismaTransaction;

const SORTABLE = ['createdAt', 'entityType', 'status', 'totalRows'];

export const importRepository = {
  async list(query: ImportListQuery): Promise<{ items: ImportJob[]; total: number }> {
    const where: Prisma.ImportJobWhereInput = {};
    if (query.entityType) where.entityType = query.entityType;
    if (query.status) where.status = query.status;
    if (query.q) where.fileName = { contains: query.q };
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.importJob.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.importJob.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<ImportJob | null> {
    const client: Db = tx ?? prisma;
    return client.importJob.findUnique({ where: { id } });
  },

  async update(id: string, data: Prisma.ImportJobUpdateInput, tx?: PrismaTransaction): Promise<ImportJob> {
    const client: Db = tx ?? prisma;
    return client.importJob.update({ where: { id }, data });
  },

  /** أرقام التسجيل الحالية ببادئة معينة (لتوليد أرقام تسلسلية عند الاستيراد). */
  async listRegistrationNosByPrefix(prefix: string, tx?: PrismaTransaction): Promise<string[]> {
    const client: Db = tx ?? prisma;
    const rows = await client.athlete.findMany({
      where: { registrationNo: { startsWith: prefix } },
      select: { registrationNo: true },
    });
    return rows.map((r) => r.registrationNo);
  },

  /** رياضيو موجودون بهواتف/بريدات معينة (كشف التكرار). */
  async findExistingAthletes(
    phones: string[],
    emails: string[],
    tx?: PrismaTransaction,
  ): Promise<Array<{ id: string; phone: string | null; email: string | null; firstName: string; lastName: string; birthDate: Date }>> {
    const client: Db = tx ?? prisma;
    if (phones.length === 0 && emails.length === 0) return [];
    return client.athlete.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(phones.length > 0 ? [{ phone: { in: phones } }] : []),
          ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
        ],
      },
      select: { id: true, phone: true, email: true, firstName: true, lastName: true, birthDate: true },
    });
  },
};
