import type { Prisma, Sport } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { normalizeArabic, escapeLike } from '@/shared/text/normalize';
import type { SportListQuery } from './schema';

const SORTABLE = ['name', 'sortOrder', 'createdAt', 'isActive'];

export interface SportListResult {
  items: Sport[];
  total: number;
}

function buildWhere(query: SportListQuery): Prisma.SportWhereInput {
  const where: Prisma.SportWhereInput = { deletedAt: null };
  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;
  if (query.q) {
    // بحث متسامح: يحتوي (لا يتأثر بحالة الأحرف) + تطبيع عربي للطرفين
    const q = escapeLike(normalizeArabic(query.q));
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { nameEn: { contains: query.q, mode: 'insensitive' } },
      // مطابقة النص المطبّع (ألف/ياء/تاء مربوطة/تشكيل) عبر LIKE
      { name: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

export const sportRepository = {
  async list(query: SportListQuery): Promise<SportListResult> {
    const where = buildWhere(query);
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.sport.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : [{ sortOrder: 'asc' }, { name: 'asc' }],
        ...pagination(query),
      }),
      prisma.sport.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<Sport | null> {
    const client = tx ?? prisma;
    return client.sport.findFirst({ where: { id, deletedAt: null } });
  },

  async findByName(name: string, excludeId?: string, tx?: PrismaTransaction): Promise<Sport | null> {
    const client = tx ?? prisma;
    return client.sport.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    }) as Promise<Sport | null>;
  },

  async countActiveGroups(sportId: string): Promise<number> {
    return prisma.group.count({ where: { sportId, deletedAt: null } });
  },

  async countAthletes(sportId: string): Promise<number> {
    return prisma.athlete.count({ where: { sportId, deletedAt: null } });
  },
};
