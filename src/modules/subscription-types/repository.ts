import type { Prisma, SubscriptionType } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import type { SubscriptionTypeListQuery } from './schema';

const SORTABLE = ['name', 'kind', 'defaultPrice', 'createdAt', 'isActive'];

export interface SubscriptionTypeListResult {
  items: SubscriptionType[];
  total: number;
}

function buildWhere(query: SubscriptionTypeListQuery): Prisma.SubscriptionTypeWhereInput {
  const where: Prisma.SubscriptionTypeWhereInput = { deletedAt: null };
  if (query.kind) where.kind = query.kind;
  if (query.sportId) where.sportId = query.sportId;
  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;
  if (query.q) {
    where.name = { contains: query.q, mode: 'insensitive' };
  }
  return where;
}

export const subscriptionTypeRepository = {
  async list(query: SubscriptionTypeListQuery): Promise<SubscriptionTypeListResult> {
    const where = buildWhere(query);
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.subscriptionType.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : [{ isActive: 'desc' }, { name: 'asc' }],
        ...pagination(query),
      }),
      prisma.subscriptionType.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<SubscriptionType | null> {
    const client = tx ?? prisma;
    return client.subscriptionType.findFirst({ where: { id, deletedAt: null } });
  },

  async findByName(
    name: string,
    sportId: string | null | undefined,
    excludeId?: string,
    tx?: PrismaTransaction,
  ): Promise<SubscriptionType | null> {
    const client = tx ?? prisma;
    return client.subscriptionType.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        sportId: sportId ?? null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  async countSubscriptions(typeId: string, tx?: PrismaTransaction): Promise<number> {
    const client = tx ?? prisma;
    return client.subscription.count({ where: { subscriptionTypeId: typeId, deletedAt: null } });
  },

  async countActiveSubscriptions(typeId: string, tx?: PrismaTransaction): Promise<number> {
    const client = tx ?? prisma;
    return client.subscription.count({
      where: {
        subscriptionTypeId: typeId,
        deletedAt: null,
        status: { in: ['ACTIVE', 'SUSPENDED', 'RENEWING'] },
      },
    });
  },

  async countActiveBySport(sportId: string, tx?: PrismaTransaction): Promise<number> {
    const client = tx ?? prisma;
    return client.subscriptionType.count({ where: { sportId, deletedAt: null, isActive: true } });
  },
};
