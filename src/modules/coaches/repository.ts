import type { Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { normalizeArabic, escapeLike } from '@/shared/text/normalize';
import type { CoachListQuery } from './schema';

const SORTABLE = ['firstName', 'lastName', 'joinedAt', 'createdAt', 'isActive'];

export const COACH_INCLUDE = {
  coachSports: { select: { sportId: true, sport: { select: { id: true, name: true, color: true } } } },
  linkedUser: { select: { id: true, email: true, fullName: true, role: true, status: true } },
  _count: { select: { groups: true, sessions: true } },
} satisfies Prisma.CoachInclude;

export type CoachWithDetails = Prisma.CoachGetPayload<{ include: typeof COACH_INCLUDE }>;

type Db = typeof prisma | PrismaTransaction;

export const coachRepository = {
  async list(query: CoachListQuery): Promise<{ items: CoachWithDetails[]; total: number }> {
    const where: Prisma.CoachWhereInput = { deletedAt: null };
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.sportId) where.coachSports = { some: { sportId: query.sportId } };
    if (query.q) {
      const q = escapeLike(normalizeArabic(query.q));
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: query.q } },
      ];
    }
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.coach.findMany({
        where,
        include: COACH_INCLUDE,
        orderBy: orderBy.length > 0 ? orderBy : [{ firstName: 'asc' }, { lastName: 'asc' }],
        ...pagination(query),
      }),
      prisma.coach.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<CoachWithDetails | null> {
    const client: Db = tx ?? prisma;
    return client.coach.findFirst({ where: { id, deletedAt: null }, include: COACH_INCLUDE });
  },

  async countActiveGroups(coachId: string, tx?: PrismaTransaction): Promise<number> {
    const client: Db = tx ?? prisma;
    return client.group.count({ where: { coachId, deletedAt: null, status: 'ACTIVE' } });
  },

  async countUpcomingSessions(coachId: string, from: Date, tx?: PrismaTransaction): Promise<number> {
    const client: Db = tx ?? prisma;
    return client.trainingSession.count({
      where: { coachId, deletedAt: null, status: { not: 'CANCELLED' }, startTime: { gte: from } },
    });
  },

  /** مستخدم مرشح للربط: يجب أن يكون بدوره COACH ونشطًا وغير محذوف. */
  async findLinkableUser(
    userId: string,
    tx?: PrismaTransaction,
  ): Promise<{ id: string; role: string; status: string; linkedCoachId: string | null } | null> {
    const client: Db = tx ?? prisma;
    return client.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, role: true, status: true, linkedCoachId: true },
    });
  },

  async setSports(coachId: string, sportIds: string[], tx?: PrismaTransaction): Promise<void> {
    const client: Db = tx ?? prisma;
    await client.coachSport.deleteMany({ where: { coachId } });
    if (sportIds.length > 0) {
      await client.coachSport.createMany({
        data: sportIds.map((sportId) => ({ coachId, sportId })),
        skipDuplicates: true,
      });
    }
  },

  async linkUser(coachId: string, userId: string | null, tx?: PrismaTransaction): Promise<void> {
    const client: Db = tx ?? prisma;
    // فك أي ربط سابق لهذا المدرب
    await client.user.updateMany({
      where: { linkedCoachId: coachId },
      data: { linkedCoachId: null },
    });
    if (userId !== null) {
      await client.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: { linkedCoachId: coachId },
      });
    }
  },
};
