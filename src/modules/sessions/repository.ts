import type { Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { normalizeArabic, escapeLike } from '@/shared/text/normalize';
import { isScopeRestricted, toScoped, type Scoped } from '@/shared/permissions/scope';
import type { AuthContext } from '@/shared/permissions/guard';
import type { ExistingSessionSlot } from './recurrence';
import type { SessionListQuery } from './schema';

const SORTABLE = ['sessionDate', 'startTime', 'endTime', 'title', 'createdAt'];

export const SESSION_INCLUDE = {
  sport: { select: { id: true, name: true, color: true } },
  group: { select: { id: true, name: true, code: true } },
  coach: { select: { id: true, firstName: true, lastName: true } },
  venue: { select: { id: true, name: true } },
} satisfies Prisma.TrainingSessionInclude;

export type SessionWithDetails = Prisma.TrainingSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

type Db = typeof prisma | PrismaTransaction;

async function scopeFilter(user: AuthContext): Promise<Prisma.TrainingSessionWhereInput> {
  const scope: Scoped = toScoped(user);
  if (!isScopeRestricted(scope)) return {};
  // المدرب المقيّد: حصصه أو حصص مجموعاته
  return {
    OR: [{ coachId: scope.linkedCoachId }, { group: { coachId: scope.linkedCoachId } }],
  };
}

export const sessionRepository = {
  async list(
    query: SessionListQuery,
    user: AuthContext,
  ): Promise<{ items: SessionWithDetails[]; total: number }> {
    const where: Prisma.TrainingSessionWhereInput = { deletedAt: null };
    const and: Prisma.TrainingSessionWhereInput[] = [];
    const scope = await scopeFilter(user);
    if (scope.OR) and.push(scope);
    if (query.groupId) where.groupId = query.groupId;
    if (query.coachId) where.coachId = query.coachId;
    if (query.venueId) where.venueId = query.venueId;
    if (query.sportId) where.sportId = query.sportId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.seriesId) where.seriesId = query.seriesId;
    if (query.from || query.to) {
      where.sessionDate = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
      };
    }
    if (query.q) {
      and.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { title: { contains: escapeLike(normalizeArabic(query.q)), mode: 'insensitive' } },
        ],
      });
    }
    if (and.length > 0) where.AND = and;
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.trainingSession.findMany({
        where,
        include: SESSION_INCLUDE,
        orderBy: orderBy.length > 0 ? orderBy : [{ sessionDate: 'desc' }, { startTime: 'desc' }],
        ...pagination(query),
      }),
      prisma.trainingSession.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<SessionWithDetails | null> {
    const client: Db = tx ?? prisma;
    return client.trainingSession.findFirst({ where: { id, deletedAt: null }, include: SESSION_INCLUDE });
  },

  /**
   * الحصص المتقاطعة زمنيًا مع مرشح (لفحص التعارض المسبق) — تستثني الملغاة/المحذوفة.
   * تُستخدم داخل Transaction قبل الإدراج، والخط النهائي قيد EXCLUDE في DB.
   */
  async findOverlapping(
    candidate: { coachId: string | null; venueId: string | null; groupId: string | null },
    startTime: Date,
    endTime: Date,
    excludeIds: string[] = [],
    tx?: PrismaTransaction,
  ): Promise<ExistingSessionSlot[]> {
    const client: Db = tx ?? prisma;
    const or: Prisma.TrainingSessionWhereInput[] = [];
    if (candidate.coachId) or.push({ coachId: candidate.coachId });
    if (candidate.venueId) or.push({ venueId: candidate.venueId });
    if (candidate.groupId) or.push({ groupId: candidate.groupId });
    if (or.length === 0) return [];
    const rows = await client.trainingSession.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CANCELLED' },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
        OR: or,
      },
      select: {
        id: true,
        title: true,
        coachId: true,
        venueId: true,
        groupId: true,
        startTime: true,
        endTime: true,
      },
    });
    return rows;
  },

  /** الحصص غير الملغاة لمجموعة في تواريخ محددة (لتفادي التكرار في التوليد). */
  async findGroupSessionsOnDates(
    groupId: string,
    dates: Date[],
    tx?: PrismaTransaction,
  ): Promise<Array<{ id: string; sessionDate: Date; seriesId: string | null }>> {
    if (dates.length === 0) return [];
    const client: Db = tx ?? prisma;
    return client.trainingSession.findMany({
      where: { groupId, deletedAt: null, status: { not: 'CANCELLED' }, sessionDate: { in: dates } },
      select: { id: true, sessionDate: true, seriesId: true },
    });
  },

  async countSeriesExceptions(seriesId: string, tx?: PrismaTransaction): Promise<number> {
    const client: Db = tx ?? prisma;
    return client.trainingSession.count({
      where: { seriesId, deletedAt: null, isException: true },
    });
  },

  /** حصص السلسلة القابلة للتحديث الجماعي (مجدولة وغير مستثناة). */
  async findUpdatableSeriesSessions(
    seriesId: string,
    tx?: PrismaTransaction,
  ): Promise<Array<{ id: string; version: number }>> {
    const client: Db = tx ?? prisma;
    return client.trainingSession.findMany({
      where: { seriesId, deletedAt: null, status: 'SCHEDULED', isException: false },
      select: { id: true, version: true },
    });
  },

  async countAttendance(sessionId: string, tx?: PrismaTransaction): Promise<number> {
    const client: Db = tx ?? prisma;
    return client.attendanceRecord.count({ where: { sessionId } });
  },
};
