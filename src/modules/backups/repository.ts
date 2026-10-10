import type { BackupRecord, Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { pagination, toOrderBy } from '@/shared/api/query';
import type { BackupListQuery } from './schema';

type Db = typeof prisma | PrismaTransaction;

const SORTABLE = ['createdAt', 'sizeBytes', 'kind'];

export const backupRepository = {
  async list(query: BackupListQuery): Promise<{ items: BackupRecord[]; total: number }> {
    const where: Prisma.BackupRecordWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.q) where.fileName = { contains: query.q, mode: 'insensitive' };
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.backupRecord.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.backupRecord.count({ where }),
    ]);
    return { items, total };
  },

  /** كل السجلات لسياسة الاحتفاظ (بلا ترقيم صفحات). */
  async listAll(): Promise<BackupRecord[]> {
    return prisma.backupRecord.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<BackupRecord | null> {
    const client: Db = tx ?? prisma;
    return client.backupRecord.findUnique({ where: { id } });
  },

  async markRestored(id: string, tx?: PrismaTransaction): Promise<BackupRecord> {
    const client: Db = tx ?? prisma;
    return client.backupRecord.update({ where: { id }, data: { restoredAt: new Date() } });
  },

  async deleteRecord(id: string, tx?: PrismaTransaction): Promise<void> {
    const client: Db = tx ?? prisma;
    await client.backupRecord.delete({ where: { id } });
  },
};
