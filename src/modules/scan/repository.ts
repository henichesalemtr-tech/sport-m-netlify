import type { AttendanceRecord } from '@prisma/client';
import { prisma } from '@/shared/db/client';

export interface ScanAthleteRow {
  id: string;
  registrationNo: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  status: string;
  birthDate: Date;
}

export interface ScanMembershipRow {
  groupId: string;
  groupName: string;
  groupCode: string;
  sportName: string;
  coachName: string | null;
}

export interface ScanSubscriptionRow {
  id: string;
  status: string;
  startDate: Date;
  endDate: Date;
  netAmount: bigint;
  paidAmount: bigint;
  typeName: string;
  typeKind: string;
  sessionsTotal: number | null;
  sessionsUsed: number;
}

export const scanRepository = {
  /** البحث عن الرياضي بتجزئات رمز المسح (SHA-256 أو HMAC بـ APP_SECRET). */
  async findAthleteByScanHashes(hashes: string[]): Promise<ScanAthleteRow | null> {
    return prisma.athlete.findFirst({
      where: { deletedAt: null, scanCodeHash: { in: hashes } },
      select: {
        id: true,
        registrationNo: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        status: true,
        birthDate: true,
      },
    });
  },

  /** عضويات الرياضي النشطة (للعرض في البطاقة واختيار حصة اليوم). */
  async findActiveGroups(athleteId: string): Promise<ScanMembershipRow[]> {
    const rows = await prisma.groupMember.findMany({
      where: { athleteId, leftAt: null, group: { deletedAt: null, status: 'ACTIVE' } },
      select: {
        groupId: true,
        group: {
          select: {
            name: true,
            code: true,
            sport: { select: { name: true } },
            coach: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      groupId: r.groupId,
      groupName: r.group.name,
      groupCode: r.group.code,
      sportName: r.group.sport.name,
      coachName: r.group.coach ? `${r.group.coach.firstName} ${r.group.coach.lastName}` : null,
    }));
  },

  /** أحدث اشتراك غير ملغى للرياضي (لتقرير الحالة المالية/الانتهاء). */
  async findLatestSubscription(athleteId: string): Promise<ScanSubscriptionRow | null> {
    return prisma.subscription.findFirst({
      where: { athleteId, deletedAt: null, status: { notIn: ['CANCELLED'] } },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        netAmount: true,
        paidAmount: true,
        sessionsTotal: true,
        sessionsUsed: true,
        subscriptionType: { select: { name: true, kind: true } },
      },
      orderBy: { endDate: 'desc' },
    }).then((row) =>
      row
        ? {
            id: row.id,
            status: row.status,
            startDate: row.startDate,
            endDate: row.endDate,
            netAmount: row.netAmount,
            paidAmount: row.paidAmount,
            typeName: row.subscriptionType.name,
            typeKind: row.subscriptionType.kind,
            sessionsTotal: row.sessionsTotal,
            sessionsUsed: row.sessionsUsed,
          }
        : null,
    );
  },

  /** حصة اليوم غير الملغاة لمجموعات الرياضي (المغطّية لوقت المسح أو الأقرب إليه). */
  async findSessionForGroups(
    groupIds: string[],
    day: Date,
    at: Date,
  ): Promise<{ id: string; title: string; startTime: Date; endTime: Date; status: string; groupId: string | null } | null> {
    if (groupIds.length === 0) return null;
    const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
    const all = await prisma.trainingSession.findMany({
      where: {
        groupId: { in: groupIds },
        deletedAt: null,
        status: 'SCHEDULED',
        sessionDate: { gte: dayStart, lte: dayEnd },
      },
      select: { id: true, title: true, startTime: true, endTime: true, status: true, groupId: true },
      orderBy: { startTime: 'asc' },
    });
    if (all.length === 0) return null;
    const covering = all.find((s) => s.startTime <= at && at <= s.endTime);
    if (covering) return covering;
    return all.reduce((best, s) =>
      Math.abs(s.startTime.getTime() - at.getTime()) < Math.abs(best.startTime.getTime() - at.getTime())
        ? s
        : best,
    );
  },

  async findSessionById(sessionId: string): Promise<{
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    status: string;
    groupId: string | null;
  } | null> {
    return prisma.trainingSession.findFirst({
      where: { id: sessionId, deletedAt: null },
      select: { id: true, title: true, startTime: true, endTime: true, status: true, groupId: true },
    });
  },

  /** آخر سجل حضور للرياضي (لمنع التكرار ضمن scan.dedupSeconds). */
  async findRecentAttendance(athleteId: string, since: Date): Promise<AttendanceRecord | null> {
    return prisma.attendanceRecord.findFirst({
      where: { athleteId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'desc' },
    });
  },
};
