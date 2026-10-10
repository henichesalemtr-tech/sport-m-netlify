/**
 * لوحة القيادة (8.1): مقاييس مجمعة من استعلامات حقيقية فقط — ممنوع بيانات وهمية.
 * وعي بالأدوار عبر الصلاحيات والنطاق (5.4): المدرب المقيّد يرى أرقام مجموعاته فقط،
 * والأقسام المالية تتطلب reports.view_finance (يراها المحاسب/الإدارة).
 */
import type { AttendanceStatus } from '@prisma/client';
import { addDays, parseDateOnly, todayIn } from '@/shared/dates';
import { fromMinorUnits } from '@/shared/money';
import { hasPermission, type AuthContext } from '@/shared/permissions/guard';
import { coachGroupIds, isScopeRestricted, toScoped } from '@/shared/permissions/scope';
import { getSettings } from '@/modules/settings/service';
import { dashboardRepository, type DashboardScope } from './repository';
import {
  aggregateSeries,
  attendanceRate,
  netIncome,
  percentage,
  seriesBucketKey,
  subscriptionBucket,
  type Granularity,
} from './metrics';
import type { ChartsQuery, FinancialQuery } from './schema';

async function scopeFor(user: AuthContext): Promise<DashboardScope> {
  const scoped = toScoped(user);
  if (!isScopeRestricted(scoped)) return { groupIds: null };
  return { groupIds: await coachGroupIds(scoped.linkedCoachId as string) };
}

export interface GeneralDashboard {
  athletes: {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    withdrawn: number;
    blocked: number;
  };
  coaches: number | null;
  sports: number | null;
  groups: number;
  subscriptions: {
    active: number;
    expiring: number;
    expired: number;
  };
  finance: {
    collected: number;
    due: number;
    debtors: number;
    expenses: number | null;
    netRevenue: number | null;
  } | null;
  asOf: string;
}

export const dashboardService = {
  /** المقاييس العامة — الأقسام المالية null لمن لا يملك reports.view_finance. */
  async general(user: AuthContext): Promise<GeneralDashboard> {
    const settings = await getSettings();
    const scope = await scopeFor(user);
    const today = parseDateOnly(todayIn(settings.timezone));
    const canSeeFinance = await hasPermission(user, 'reports.view_finance');

    const [athletes, coaches, sports, groups, activeSubs, expiredSubs, collected, due, expenses] =
      await Promise.all([
        dashboardRepository.countAthletes(scope),
        canSeeFinance ? dashboardRepository.countCoaches() : dashboardRepository.countCoaches(),
        dashboardRepository.countSports(),
        dashboardRepository.countGroups(scope),
        dashboardRepository.listActiveSubscriptions(scope),
        dashboardRepository.countExpiredSubscriptions(scope),
        canSeeFinance ? dashboardRepository.collectedSum(scope) : Promise.resolve(0n),
        canSeeFinance ? dashboardRepository.dueTotals(scope) : Promise.resolve({ dueMinor: 0n, debtors: 0 }),
        canSeeFinance ? dashboardRepository.expensesSum(scope) : Promise.resolve(0n),
      ]);

    let expiring = 0;
    let stillActive = 0;
    for (const s of activeSubs) {
      const bucket = subscriptionBucket('ACTIVE', s.endDate, today, settings.subscriptionExpiringDays);
      if (bucket === 'EXPIRING') expiring++;
      else stillActive++;
    }

    return {
      athletes: {
        total: athletes.total,
        active: athletes.byStatus['ACTIVE'] ?? 0,
        inactive: athletes.byStatus['INACTIVE'] ?? 0,
        suspended: athletes.byStatus['SUSPENDED'] ?? 0,
        withdrawn: athletes.byStatus['WITHDRAWN'] ?? 0,
        blocked: athletes.byStatus['BLOCKED'] ?? 0,
      },
      coaches,
      sports,
      groups,
      subscriptions: { active: stillActive, expiring, expired: expiredSubs },
      finance: canSeeFinance
        ? {
            collected: fromMinorUnits(collected, settings.currencyDecimals),
            due: fromMinorUnits(due.dueMinor, settings.currencyDecimals),
            debtors: due.debtors,
            expenses: fromMinorUnits(expenses, settings.currencyDecimals),
            netRevenue: fromMinorUnits(netIncome(collected, expenses), settings.currencyDecimals),
          }
        : null,
      asOf: new Date().toISOString(),
    };
  },

  /** المالي: سلاسل إيراد/مصروف/صافي حسب الحبيبية (يتطلب reports.view_finance — يُفحص في المسار). */
  async financial(user: AuthContext, query: FinancialQuery): Promise<{
    granularity: Granularity;
    series: Array<{ key: string; revenue: number; expenses: number; net: number }>;
    totals: { revenue: number; expenses: number; net: number };
  }> {
    const settings = await getSettings();
    const to = query.dateTo ? parseDateOnly(query.dateTo) : new Date();
    const from = query.dateFrom
      ? parseDateOnly(query.dateFrom)
      : addDays(to, query.granularity === 'day' ? -29 : query.granularity === 'week' ? -83 : query.granularity === 'month' ? -364 : -1094);

    const [revenueRows, expenseRows] = await Promise.all([
      dashboardRepository.revenueSeries(from, to),
      dashboardRepository.expenseSeries(from, to),
    ]);

    const granularity = query.granularity;
    const revenueSeries = aggregateSeries(revenueRows, granularity, from, to);
    const expenseSeries = aggregateSeries(expenseRows, granularity, from, to);
    const expenseByKey = new Map(expenseSeries.map((p) => [p.key, p.total] as const));

    let totalRevenue = 0n;
    let totalExpenses = 0n;
    const series = revenueSeries.map((p) => {
      const expensesMinor = expenseByKey.get(p.key) ?? 0n;
      totalRevenue += p.total;
      totalExpenses += expensesMinor;
      return {
        key: p.key,
        revenue: fromMinorUnits(p.total, settings.currencyDecimals),
        expenses: fromMinorUnits(expensesMinor, settings.currencyDecimals),
        net: fromMinorUnits(netIncome(p.total, expensesMinor), settings.currencyDecimals),
      };
    });

    return {
      granularity,
      series,
      totals: {
        revenue: fromMinorUnits(totalRevenue, settings.currencyDecimals),
        expenses: fromMinorUnits(totalExpenses, settings.currencyDecimals),
        net: fromMinorUnits(netIncome(totalRevenue, totalExpenses), settings.currencyDecimals),
      },
    };
  },

  /** الحضور اليوم: حاضر/غائب/متأخر + النسبة + أعلى المجموعات غيابًا + آخر السجلات. */
  async attendance(user: AuthContext): Promise<{
    today: string;
    counts: { present: number; absent: number; late: number; excused: number; total: number };
    rate: number | null;
    highAbsenceGroups: Array<{ groupId: string; name: string; absences: number }>;
    lastRecords: Array<{ athleteName: string; sessionTitle: string; status: AttendanceStatus; recordDate: string; recordedAt: Date }>;
  }> {
    const settings = await getSettings();
    const scope = await scopeFor(user);
    const today = parseDateOnly(todayIn(settings.timezone));

    const [byStatus, highAbsence, last] = await Promise.all([
      dashboardRepository.attendanceByStatus(today, scope),
      dashboardRepository.highAbsenceGroups(addDays(today, -30), scope),
      dashboardRepository.lastAttendance(scope),
    ]);

    const counts = {
      present: byStatus['PRESENT'] ?? 0,
      absent: byStatus['ABSENT'] ?? 0,
      late: byStatus['LATE'] ?? 0,
      excused: byStatus['EXCUSED'] ?? 0,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    };

    return {
      today: todayIn(settings.timezone),
      counts,
      rate: attendanceRate(counts),
      highAbsenceGroups: highAbsence,
      lastRecords: last.map((r) => ({ ...r, recordDate: r.recordDate.toISOString().slice(0, 10) })),
    };
  },

  /** سلاسل الرسوم: إيراد/مصروف (12 شهرًا)، حضور (14 يومًا)، رياضيو كل نشاط، الاشتراكات بالحالة. */
  async charts(user: AuthContext, query: ChartsQuery): Promise<{
    revenueVsExpenses: Array<{ key: string; revenue: number; expenses: number }> | null;
    attendanceTrend: Array<{ date: string; rate: number | null; present: number; absent: number; late: number }>;
    athletesBySport: Array<{ sport: string; athletes: number }>;
    subscriptionsByStatus: Array<{ status: string; count: number }>;
  }> {
    const settings = await getSettings();
    const scope = await scopeFor(user);
    const today = parseDateOnly(todayIn(settings.timezone));
    const canSeeFinance = await hasPermission(user, 'reports.view_finance');

    const attendanceFrom = addDays(today, -(query.attendanceDays - 1));
    const revenueFrom = addDays(today, -((query.revenueMonths * 31) - 1));

    const [attendanceRows, athletesBySport, subsByStatus, revenueRows, expenseRows] = await Promise.all([
      dashboardRepository.attendanceInRange(attendanceFrom, today, scope),
      dashboardRepository.athletesBySport(scope),
      dashboardRepository.subscriptionsByStatus(scope),
      canSeeFinance ? dashboardRepository.revenueSeries(revenueFrom, today) : Promise.resolve([]),
      canSeeFinance ? dashboardRepository.expenseSeries(revenueFrom, today) : Promise.resolve([]),
    ]);

    // سلسلة الحضور اليومية
    const byDay = new Map<string, { present: number; absent: number; late: number; excused: number }>();
    for (let i = 0; i < query.attendanceDays; i++) {
      byDay.set(todayIn(settings.timezone, addDays(attendanceFrom, i)), { present: 0, absent: 0, late: 0, excused: 0 });
    }
    for (const r of attendanceRows) {
      const key = todayIn(settings.timezone, r.date);
      const bucket = byDay.get(key);
      if (!bucket) continue;
      if (r.status === 'PRESENT') bucket.present++;
      else if (r.status === 'ABSENT') bucket.absent++;
      else if (r.status === 'LATE') bucket.late++;
      else bucket.excused++;
    }
    const attendanceTrend = [...byDay.entries()].map(([date, c]) => ({
      date,
      rate: attendanceRate(c),
      present: c.present,
      absent: c.absent,
      late: c.late,
    }));

    let revenueVsExpenses: Array<{ key: string; revenue: number; expenses: number }> | null = null;
    if (canSeeFinance) {
      const revSeries = aggregateSeries(revenueRows, 'month', revenueFrom, today);
      const expSeries = aggregateSeries(expenseRows, 'month', revenueFrom, today);
      const expByKey = new Map(expSeries.map((p) => [p.key, p.total] as const));
      revenueVsExpenses = revSeries.map((p) => ({
        key: p.key,
        revenue: fromMinorUnits(p.total, settings.currencyDecimals),
        expenses: fromMinorUnits(expByKey.get(p.key) ?? 0n, settings.currencyDecimals),
      }));
    }

    return {
      revenueVsExpenses,
      attendanceTrend,
      athletesBySport,
      subscriptionsByStatus: subsByStatus.map((s) => ({ status: s.status, count: s.count })),
    };
  },
};

export { seriesBucketKey, percentage };
