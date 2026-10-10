import type { AttendanceRecord, Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { pagination, toOrderBy } from '@/shared/api/query';
import type { AttendanceListQuery } from './schema';

type Db = typeof prisma | PrismaTransaction;

export interface SessionForAttendance {
  id: string;
  title: string;
  status: string;
  groupId: string | null;
  sessionDate: Date;
  startTime: Date;
  endTime: Date;
  coachId: string | null;
}

export interface SheetRecordRow {
  id: string;
  athleteId: string;
  sessionId: string;
  status: string;
  minutesLate: number;
  consumedSession: boolean;
}

export const attendanceRepository = {
  async findById(id: string, tx?: PrismaTransaction): Promise<AttendanceRecord | null> {
    const client: Db = tx ?? prisma;
    return client.attendanceRecord.findUnique({ where: { id } });
  },

  /** القيد الفريد (athlete, session) — فحص مسبق قبل الإدراج. */
  async findForAthleteSession(
    athleteId: string,
    sessionId: string,
    tx?: PrismaTransaction,
  ): Promise<AttendanceRecord | null> {
    const client: Db = tx ?? prisma;
    return client.attendanceRecord.findUnique({
      where: { athleteId_sessionId: { athleteId, sessionId } },
    });
  },

  async findSession(sessionId: string, tx?: PrismaTransaction): Promise<SessionForAttendance | null> {
    const client: Db = tx ?? prisma;
    return client.trainingSession.findFirst({
      where: { id: sessionId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        groupId: true,
        sessionDate: true,
        startTime: true,
        endTime: true,
        coachId: true,
      },
    });
  },

  /** أعضاء المجموعة النشطون (leftAt = null) — الوحيدون المسموح تسجيل حضورهم. */
  async listActiveMembers(
    groupId: string,
    tx?: PrismaTransaction,
  ): Promise<Array<{ id: string; athleteId: string; firstName: string; lastName: string; photoUrl: string | null }>> {
    const client: Db = tx ?? prisma;
    return client.groupMember.findMany({
      where: { groupId, leftAt: null },
      select: {
        id: true,
        athleteId: true,
        athlete: { select: { firstName: true, lastName: true, photoUrl: true } },
      },
    }).then((rows) =>
      rows.map((r) => ({
        id: r.id,
        athleteId: r.athleteId,
        firstName: r.athlete.firstName,
        lastName: r.athlete.lastName,
        photoUrl: r.athlete.photoUrl,
      })),
    );
  },

  async isAthleteActiveMember(
    groupId: string,
    athleteId: string,
    tx?: PrismaTransaction,
  ): Promise<boolean> {
    const client: Db = tx ?? prisma;
    const count = await client.groupMember.count({ where: { groupId, athleteId, leftAt: null } });
    return count > 0;
  },

  async create(
    data: Prisma.AttendanceRecordUncheckedCreateInput,
    tx: PrismaTransaction,
  ): Promise<AttendanceRecord> {
    return tx.attendanceRecord.create({ data });
  },

  async update(
    id: string,
    data: Prisma.AttendanceRecordUpdateInput,
    tx: PrismaTransaction,
  ): Promise<AttendanceRecord> {
    return tx.attendanceRecord.update({ where: { id }, data });
  },

  async listBySession(sessionId: string, tx?: PrismaTransaction): Promise<AttendanceRecord[]> {
    const client: Db = tx ?? prisma;
    return client.attendanceRecord.findMany({ where: { sessionId } });
  },

  /** سجلات الرياضي مرتبة من الأحدث (حسب بداية الحصة) — لكشف الغيابات المتتالية. */
  async recentByAthlete(
    athleteId: string,
    limit: number,
    tx?: PrismaTransaction,
  ): Promise<Array<{ id: string; status: string; startTime: Date }>> {
    const client: Db = tx ?? prisma;
    return client.attendanceRecord.findMany({
      where: { athleteId, session: { status: { not: 'CANCELLED' } } },
      include: { session: { select: { startTime: true } } },
      orderBy: { session: { startTime: 'desc' } },
      take: limit,
    }).then((rows) => rows.map((r) => ({ id: r.id, status: r.status, startTime: r.session.startTime })));
  },

  /** اشتراك حصص (SESSIONS) نشط يغطي تاريخ الحصة وله رصيد. */
  async findSessionsSubscription(
    athleteId: string,
    sessionDate: Date,
    tx?: PrismaTransaction,
  ): Promise<{ id: string; sessionsTotal: number | null; sessionsUsed: number } | null> {
    const client: Db = tx ?? prisma;
    return client.subscription.findFirst({
      where: {
        athleteId,
        deletedAt: null,
        status: 'ACTIVE',
        subscriptionType: { kind: 'SESSIONS' },
        startDate: { lte: sessionDate },
        endDate: { gte: sessionDate },
      },
      select: { id: true, sessionsTotal: true, sessionsUsed: true },
      orderBy: { endDate: 'asc' },
    });
  },

  async adjustSessionsUsed(
    subscriptionId: string,
    delta: number,
    tx: PrismaTransaction,
  ): Promise<void> {
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { sessionsUsed: { increment: delta } },
    });
  },

  /** سجلات ورقة الحضور لمجموعة/فترة مع الرياضيين والحصص. */
  async sheet(
    query: AttendanceListQuery,
    restrictGroupIds?: string[],
  ): Promise<{ items: SheetRecordRow[]; total: number }> {
    const where: Prisma.AttendanceRecordWhereInput = {};
    if (query.sessionId) where.sessionId = query.sessionId;
    if (restrictGroupIds) {
      where.groupId = query.groupId ? { in: restrictGroupIds.includes(query.groupId) ? [query.groupId] : [] } : { in: restrictGroupIds };
    } else if (query.groupId) {
      where.groupId = query.groupId;
    }
    if (query.athleteId) where.athleteId = query.athleteId;
    if (query.from || query.to) {
      where.recordDate = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
      };
    }
    const orderBy = toOrderBy(query.sort, ['recordDate', 'recordedAt']);
    const [rows, total] = await prisma.$transaction([
      prisma.attendanceRecord.findMany({
        where,
        select: {
          id: true,
          athleteId: true,
          sessionId: true,
          status: true,
          minutesLate: true,
          consumedSession: true,
        },
        orderBy: orderBy.length > 0 ? orderBy : [{ recordDate: 'asc' }],
        ...pagination(query),
      }),
      prisma.attendanceRecord.count({ where }),
    ]);
    return { items: rows, total };
  },

  /** حصص مجموعة ضمن فترة (لورقة الحضور). */
  async listGroupSessions(
    groupId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ id: string; title: string; sessionDate: Date; startTime: Date; endTime: Date; status: string }>> {
    return prisma.trainingSession.findMany({
      where: { groupId, deletedAt: null, sessionDate: { gte: from, lte: to } },
      select: { id: true, title: true, sessionDate: true, startTime: true, endTime: true, status: true },
      orderBy: [{ sessionDate: 'asc' }, { startTime: 'asc' }],
    });
  },
};
