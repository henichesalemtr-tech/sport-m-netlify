import type { AgeCategory, Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { normalizeArabic, escapeLike } from '@/shared/text/normalize';
import type { AgeCategoryListQuery } from './schema';

const SORTABLE = ['name', 'sortOrder', 'minAge', 'createdAt'];

export const ageCategoryRepository = {
  async list(query: AgeCategoryListQuery): Promise<{ items: AgeCategory[]; total: number }> {
    const where: Prisma.AgeCategoryWhereInput = { deletedAt: null };
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: escapeLike(normalizeArabic(query.q)), mode: 'insensitive' } },
      ];
    }
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.ageCategory.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : [{ sortOrder: 'asc' }, { minAge: 'asc' }],
        ...pagination(query),
      }),
      prisma.ageCategory.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<AgeCategory | null> {
    const client = tx ?? prisma;
    return client.ageCategory.findFirst({ where: { id, deletedAt: null } });
  },

  /** كل الفئات النشطة غير المحذوفة — تُستخدم لفحص الاستمرارية (تداخل/فجوات). */
  async findAllActive(tx?: PrismaTransaction): Promise<AgeCategory[]> {
    const client = tx ?? prisma;
    return client.ageCategory.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { minAge: 'asc' }],
    });
  },

  async findByName(name: string, excludeId?: string, tx?: PrismaTransaction): Promise<AgeCategory | null> {
    const client = tx ?? prisma;
    return client.ageCategory.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    }) as Promise<AgeCategory | null>;
  },

  async countGroups(categoryId: string): Promise<number> {
    return prisma.group.count({ where: { ageCategoryId: categoryId, deletedAt: null } });
  },

  async countAthletes(categoryId: string): Promise<number> {
    return prisma.athlete.count({ where: { ageCategoryId: categoryId, deletedAt: null } });
  },
};
