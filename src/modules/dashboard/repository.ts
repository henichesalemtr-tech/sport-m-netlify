/**
 * مستودع لوحة القيادة — تجميعات Prisma حقيقية فقط (8.1: ممنوع بيانات وهمية).
 * النطاق: groupIds = null يعني غير مقيّد؛ وإلا كل الاستعلامات تُقيَّد بمجموعات المدرب.
 */
import type { AttendanceStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { prisma } from '@/shared/db/client';

export interface DashboardScope {
  groupIds: string[] | null;
}

function athleteInScope(s: DashboardScope): Prisma.AthleteWhereInput {
  return s.groupIds === null
    ? {}
    : { groupMembers: { some: { groupId: { in: s.groupIds }, leftAt: null } } };
}

export const dashboardRepository = {
  async countAthletes(s: DashboardScope): Promise<{ total: number; byStatus: Record<string, number> }> {
    const where: Prisma.AthleteWhereInput = { deletedAt: null, ...athleteInScope(s) };
    const grouped = await prisma.athlete.groupBy({ by: ['status'], where, _count: { _all: true } });
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
      total += g._count._all;
    }
    return { total, byStatus };
  },

  async countCoaches(): Promise<number> {
    return prisma.coach.count({ where: { deletedAt: null, isActive: true } });
  },

  async countSports(): Promise<number> {
    return prisma.sport.count({ where: { deletedAt: null, isActive: true } });
  },

  async countGroups(s: DashboardScope): Promise<number> {
    return prisma.group.count({
      where: { deletedAt: null, status: 'ACTIVE', ...(s.groupIds ? { id: { in: s.groupIds } } : {}) },
    });
  },

  /** اشتراكات نشطة مع تواريخ انتهائها (التصنيف في metrics.ts). */
  async listActiveSubscriptions(s: DashboardScope): Promise<Array<{ id: string; endDate: Date }>> {
    return prisma.subscription.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        athlete: athleteInScope(s),
        ...(s.groupIds ? { OR: [{ groupId: { in: s.groupIds } }, { groupId: null }] } : {}),
      },
      select: { id: true, endDate: true },
    });
  },

  async countExpiredSubscriptions(s: DashboardScope): Promise<number> {
    return prisma.subscription.count({
      where: { deletedAt: null, status: 'EXPIRED', athlete: athleteInScope(s) },
    });
  },

  /** المحصَّل: مجموع صافي الدفعات المكتملة (ضمن نطاق اختياري). */
  async collectedSum(s: DashboardScope, from?: Date, to?: Date): Promise<bigint> {
    const agg = await prisma.payment.aggregate({
      where: {
        status: 'COMPLETED',
        athlete: athleteInScope(s),
        ...(from || to ? { paymentDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      _sum: { netAmount: true },
    });
    return agg._sum.netAmount ?? 0n;
  },

  /** المستحق: مجموع المتبقي (>0) على الاشتراكات النشطة/المنتهية. */
  async dueTotals(s: DashboardScope): Promise<{ dueMinor: bigint; debtors: number }> {
    const subs = await prisma.subscription.findMany({
      where: { deletedAt: null, status: { in: ['ACTIVE', 'EXPIRED'] }, athlete: athleteInScope(s) },
      select: { netAmount: true, paidAmount: true },
    });
    let dueMinor = 0n;
    let debtors = 0;
    for (const sub of subs) {
      const remaining = sub.netAmount - sub.paidAmount;
      if (remaining > 0n) {
        dueMinor += remaining;
        debtors++;
      }
    }
    return { dueMinor, debtors };
  },

  async expensesSum(s: DashboardScope, from?: Date, to?: Date): Promise<bigint> {
    // المصاريف غير مرتبطة بمجموعات — المدرب المقيّد لا يراها (يُصفَّر في الخدمة)
    if (s.groupIds !== null) return 0n;
    const agg = await prisma.expense.aggregate({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(from || to ? { expenseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0n;
  },

  async attendanceByStatus(date: Date, s: DashboardScope): Promise<Record<string, number>> {
    const grouped = await prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        recordDate: date,
        ...(s.groupIds ? { groupId: { in: s.groupIds } } : {}),
      },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const g of grouped) out[g.status] = g._count._all;
    return out;
  },

  /** سجلات الحضور ضمن مدى (لسلاسل الرسوم) — status + recordDate فقط. */
  async attendanceInRange(from: Date, to: Date, s: DashboardScope): Promise<Array<{ date: Date; status: AttendanceStatus }>> {
    const rows = await prisma.attendanceRecord.findMany({
      where: {
        recordDate: { gte: from, lte: to },
        ...(s.groupIds ? { groupId: { in: s.groupIds } } : {}),
      },
      select: { recordDate: true, status: true },
    });
    return rows.map((r) => ({ date: r.recordDate, status: r.status }));
  },

  /** أكثر المجموعات غيابًا خلال مدة (لتنبيه الإدارة/المدرب). */
  async highAbsenceGroups(since: Date, s: DashboardScope, take = 5): Promise<Array<{ groupId: string; name: string; absences: number }>> {
    const grouped = await prisma.attendanceRecord.groupBy({
      by: ['groupId'],
      where: {
        status: 'ABSENT',
        recordDate: { gte: since },
        ...(s.groupIds ? { groupId: { in: s.groupIds } } : {}),
      },
      _count: { _all: true },
      orderBy: { _count: { groupId: 'desc' } },
      take,
    });
    const groups = await prisma.group.findMany({
      where: { id: { in: grouped.map((g) => g.groupId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(groups.map((g) => [g.id, g.name] as const));
    return grouped
      .map((g) => ({ groupId: g.groupId, name: nameById.get(g.groupId) ?? '', absences: g._count._all }))
      .sort((a, b) => b.absences - a.absences);
  },

  async lastAttendance(s: DashboardScope, take = 8): Promise<Array<{
    athleteName: string;
    sessionTitle: string;
    status: AttendanceStatus;
    recordDate: Date;
    recordedAt: Date;
  }>> {
    const rows = await prisma.attendanceRecord.findMany({
      where: { ...(s.groupIds ? { groupId: { in: s.groupIds } } : {}) },
      include: {
        athlete: { select: { firstName: true, lastName: true } },
        session: { select: { title: true } },
      },
      orderBy: { recordedAt: 'desc' },
      take,
    });
    return rows.map((r) => ({
      athleteName: `${r.athlete.firstName} ${r.athlete.lastName}`,
      sessionTitle: r.session.title,
      status: r.status,
      recordDate: r.recordDate,
      recordedAt: r.recordedAt,
    }));
  },

  async revenueSeries(from: Date, to: Date): Promise<Array<{ date: Date; amountMinor: bigint }>> {
    const rows = await prisma.payment.findMany({
      where: { status: 'COMPLETED', paymentDate: { gte: from, lte: to } },
      select: { paymentDate: true, netAmount: true },
    });
    return rows.map((r) => ({ date: r.paymentDate, amountMinor: r.netAmount }));
  },

  async expenseSeries(from: Date, to: Date): Promise<Array<{ date: Date; amountMinor: bigint }>> {
    const rows = await prisma.expense.findMany({
      where: { deletedAt: null, status: 'ACTIVE', expenseDate: { gte: from, lte: to } },
      select: { expenseDate: true, amount: true },
    });
    return rows.map((r) => ({ date: r.expenseDate, amountMinor: r.amount }));
  },

  async athletesBySport(s: DashboardScope): Promise<Array<{ sport: string; athletes: number }>> {
    const sports = await prisma.sport.findMany({
      where: { deletedAt: null },
      select: { name: true, athletes: { where: { deletedAt: null, ...athleteInScope(s) }, select: { id: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return sports.map((sp) => ({ sport: sp.name, athletes: sp.athletes.length }));
  },

  async subscriptionsByStatus(s: DashboardScope): Promise<Array<{ status: SubscriptionStatus; count: number }>> {
    const grouped = await prisma.subscription.groupBy({
      by: ['status'],
      where: { deletedAt: null, athlete: athleteInScope(s) },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  },
};
