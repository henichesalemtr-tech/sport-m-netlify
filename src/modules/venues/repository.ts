import type { Prisma, Venue } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { normalizeArabic, escapeLike } from '@/shared/text/normalize';
import type { VenueListQuery } from './schema';

const SORTABLE = ['name', 'type', 'status', 'capacity', 'createdAt'];

export const venueRepository = {
  async list(query: VenueListQuery): Promise<{ items: Venue[]; total: number }> {
    const where: Prisma.VenueWhereInput = { deletedAt: null };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: escapeLike(normalizeArabic(query.q)), mode: 'insensitive' } },
        { location: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.venue.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : [{ name: 'asc' }],
        ...pagination(query),
      }),
      prisma.venue.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<Venue | null> {
    const client = tx ?? prisma;
    return client.venue.findFirst({ where: { id, deletedAt: null } });
  },

  async findByName(name: string, excludeId?: string, tx?: PrismaTransaction): Promise<Venue | null> {
    const client = tx ?? prisma;
    return client.venue.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    }) as Promise<Venue | null>;
  },

  async countGroups(venueId: string): Promise<number> {
    return prisma.group.count({ where: { venueId, deletedAt: null } });
  },

  async countUpcomingSessions(venueId: string, from: Date): Promise<number> {
    return prisma.trainingSession.count({
      where: { venueId, deletedAt: null, status: { not: 'CANCELLED' }, startTime: { gte: from } },
    });
  },
};
