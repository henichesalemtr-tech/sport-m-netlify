/**
 * مستودع التقارير — استعلامات Prisma فقط (4.2).
 * كل دالة تطبّق الفلاتر + نطاق البيانات (athleteScope/groupScope) داخل الاستعلام نفسه.
 * المبالغ تُحوَّل من أصغر وحدة إلى عدد عشري للعرض فقط (ممنوع float في التخزين).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { calcAge, diffInDays, parseDateOnly, todayIn } from '@/shared/dates';
import { fromMinorUnits } from '@/shared/money';
import { appTimeZone } from '@/shared/config/settings';
import type { CellValue } from '@/shared/export/csv';
import { classifyAging } from './aging';

export type ReportRow = Record<string, CellValue>;

export interface ReportFilters {
  dateFrom?: Date;
  dateTo?: Date;
  sportId?: string;
  groupId?: string;
  coachId?: string;
  ageCategoryId?: string;
  athleteId?: string;
  status?: string;
  /** شرط نطاق الرياضيين (المدرب المقيّد). */
  athleteScope: Prisma.AthleteWhereInput;
  /** شرط نطاق المجموعات (المدرب المقيّد). */
  groupScope: Prisma.GroupWhereInput;
  /** معرّف المدرب المقيّد أو null. */
  restrictedCoachId: string | null;
  /** خانات العملة العشرية (من الإعدادات). */
  decimals: number;
}

export interface ReportPaging {
  skip: number;
  take: number;
}

export interface ReportData {
  rows: ReportRow[];
  total: number;
  summary?: Record<string, CellValue>;
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function money(minor: bigint, decimals: number): number {
  return fromMinorUnits(minor, decimals);
}

const GENDER_AR: Record<string, string> = { MALE: 'ذكر', FEMALE: 'أنثى' };
const ATHLETE_STATUS_AR: Record<string, string> = {
  ACTIVE: 'نشط', INACTIVE: 'غير نشط', SUSPENDED: 'موقوف', WITHDRAWN: 'منسحب', BLOCKED: 'محظور',
};
const SUB_STATUS_AR: Record<string, string> = {
  ACTIVE: 'نشط', EXPIRED: 'منتهٍ', SUSPENDED: 'موقوف', RENEWING: 'قيد التجديد', CANCELLED: 'ملغى',
};
const PAY_STATUS_AR: Record<string, string> = { COMPLETED: 'مكتملة', VOIDED: 'ملغاة' };
const ATT_STATUS_AR: Record<string, string> = {
  PRESENT: 'حاضر', ABSENT: 'غائب', LATE: 'متأخر', EXCUSED: 'بعذر',
};
const CASH_TYPE_AR: Record<string, string> = {
  OPENING_BALANCE: 'رصيد افتتاحي', INCOME: 'إيراد', EXPENSE: 'مصروف',
  ADJUSTMENT: 'تسوية', REVERSAL: 'عكس',
};

export const reportRepository = {
  async athletes(f: ReportFilters, paging?: ReportPaging): Promise<ReportData> {
    const where: Prisma.AthleteWhereInput = {
      deletedAt: null,
      ...f.athleteScope,
      ...(f.sportId ? { sportId: f.sportId } : {}),
      ...(f.ageCategoryId ? { ageCategoryId: f.ageCategoryId } : {}),
      ...(f.status ? { status: f.status as Prisma.AthleteWhereInput['status'] } : {}),
      ...(f.athleteId ? { id: f.athleteId } : {}),
      ...(f.dateFrom || f.dateTo
        ? { registrationDate: { ...(f.dateFrom ? { gte: f.dateFrom } : {}), ...(f.dateTo ? { lte: f.dateTo } : {}) } }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.athlete.findMany({
        where,
        include: {
          sport: { select: { name: true } },
          groupMembers: { where: { leftAt: null }, include: { group: { select: { name: true } } } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        ...(paging ?? {}),
      }),
      prisma.athlete.count({ where }),
    ]);
    const today = new Date();
    return {
      rows: items.map((a) => ({
        registrationNo: a.registrationNo,
        name: `${a.firstName} ${a.lastName}`,
        gender: GENDER_AR[a.gender] ?? a.gender,
        birthDate: day(a.birthDate),
        age: calcAge(a.birthDate, today),
        sport: a.sport?.name ?? '',
        groups: a.groupMembers.map((m) => m.group.name).join('، ') || '',
        phone: a.phone ?? '',
        email: a.email ?? '',
        status: ATHLETE_STATUS_AR[a.status] ?? a.status,
        registrationDate: day(a.registrationDate),
      })),
      total,
    };
  },

  async subscriptions(f: ReportFilters, paging?: ReportPaging): Promise<ReportData> {
    const where: Prisma.SubscriptionWhereInput = {
      deletedAt: null,
      athlete: f.athleteScope,
      ...(f.sportId ? { sportId: f.sportId } : {}),
      ...(f.groupId ? { groupId: f.groupId } : {}),
      ...(f.athleteId ? { athleteId: f.athleteId } : {}),
      ...(f.status ? { status: f.status as Prisma.SubscriptionWhereInput['status'] } : {}),
      ...(f.dateFrom || f.dateTo
        ? { endDate: { ...(f.dateFrom ? { gte: f.dateFrom } : {}), ...(f.dateTo ? { lte: f.dateTo } : {}) } }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.subscription.findMany({
        where,
        include: {
          athlete: { select: { firstName: true, lastName: true, registrationNo: true } },
          subscriptionType: { select: { name: true } },
        },
        orderBy: { endDate: 'desc' },
        ...(paging ?? {}),
      }),
      prisma.subscription.count({ where }),
    ]);
    return {
      rows: items.map((s) => ({
        athlete: `${s.athlete.firstName} ${s.athlete.lastName}`,
        registrationNo: s.athlete.registrationNo,
        type: s.subscriptionType.name,
        startDate: day(s.startDate),
        endDate: day(s.endDate),
        price: money(s.price, f.decimals),
        net: money(s.netAmount, f.decimals),
        paid: money(s.paidAmount, f.decimals),
        remaining: money(s.netAmount - s.paidAmount, f.decimals),
        dueDate: day(s.dueDate),
        status: SUB_STATUS_AR[s.status] ?? s.status,
      })),
      total,
    };
  },

  async payments(f: ReportFilters, paging?: ReportPaging): Promise<ReportData> {
    const status = f.status === 'VOIDED' || f.status === 'COMPLETED' ? f.status : 'COMPLETED';
    const where: Prisma.PaymentWhereInput = {
      status: status as Prisma.PaymentWhereInput['status'],
      athlete: f.athleteScope,
      ...(f.athleteId ? { athleteId: f.athleteId } : {}),
      ...(f.dateFrom || f.dateTo
        ? { paymentDate: { ...(f.dateFrom ? { gte: f.dateFrom } : {}), ...(f.dateTo ? { lte: f.dateTo } : {}) } }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        include: {
          athlete: { select: { firstName: true, lastName: true, registrationNo: true } },
          paymentMethod: { select: { name: true } },
        },
        orderBy: { paymentDate: 'desc' },
        ...(paging ?? {}),
      }),
      prisma.payment.count({ where }),
    ]);
    return {
      rows: items.map((p) => ({
        transactionNo: p.transactionNo,
        paymentDate: day(p.paymentDate),
        athlete: `${p.athlete.firstName} ${p.athlete.lastName}`,
        registrationNo: p.athlete.registrationNo,
        method: p.paymentMethod.name,
        amount: money(p.amount, f.decimals),
        discount: money(p.discount, f.decimals),
        net: money(p.netAmount, f.decimals),
        status: PAY_STATUS_AR[p.status] ?? p.status,
      })),
      total,
    };
  },

  /** الديون مع Aging — Remaining محسوب، لذا الترقيم في الذاكرة بعد الفلترة. */
  async debts(f: ReportFilters, paging?: ReportPaging): Promise<ReportData> {
    const where: Prisma.SubscriptionWhereInput = {
      deletedAt: null,
      status: { in: ['ACTIVE', 'EXPIRED'] },
      athlete: f.athleteScope,
      ...(f.athleteId ? { athleteId: f.athleteId } : {}),
      ...(f.sportId ? { sportId: f.sportId } : {}),
      ...(f.groupId ? { groupId: f.groupId } : {}),
    };
    const items = await prisma.subscription.findMany({
      where,
      include: {
        athlete: { select: { firstName: true, lastName: true, registrationNo: true } },
        subscriptionType: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
    const today = parseDateOnly(todayIn(appTimeZone()));
    const indebted = items.filter((s) => s.netAmount - s.paidAmount > 0n);

    const allRows: ReportRow[] = indebted.map((s) => {
      const remainingMinor = s.netAmount - s.paidAmount;
      const daysOverdue = diffInDays(s.dueDate, today);
      return {
        athlete: `${s.athlete.firstName} ${s.athlete.lastName}`,
        registrationNo: s.athlete.registrationNo,
        type: s.subscriptionType.name,
        net: money(s.netAmount, f.decimals),
        paid: money(s.paidAmount, f.decimals),
        remaining: money(remainingMinor, f.decimals),
        dueDate: day(s.dueDate),
        daysOverdue: Math.max(0, daysOverdue),
        aging: classifyAging(daysOverdue),
        _remainingMinor: remainingMinor,
        _daysOverdue: daysOverdue,
      };
    });

    // ملخص الشرائح (مبالغ minor units تُحوَّل للعرض)
    const buckets = { current: 0n, b30: 0n, b60: 0n, b60p: 0n };
    for (const r of allRows) {
      const minor = r._remainingMinor as bigint;
      const bucket = classifyAging(r._daysOverdue as number);
      if (bucket === 'CURRENT') buckets.current += minor;
      else if (bucket === '0-30') buckets.b30 += minor;
      else if (bucket === '31-60') buckets.b60 += minor;
      else buckets.b60p += minor;
    }

    const page = paging ? allRows.slice(paging.skip, paging.skip + paging.take) : allRows;
    return {
      rows: page.map(({ _remainingMinor: _rm, _daysOverdue: _do, ...rest }) => rest),
      total: allRows.length,
      summary: {
        totalDebt: money(allRows.reduce((a, r) => a + (r._remainingMinor as bigint), 0n), f.decimals),
        current: money(buckets.current, f.decimals),
        days0To30: money(buckets.b30, f.decimals),
        days31To60: money(buckets.b60, f.decimals),
        over60: money(buckets.b60p, f.decimals),
      },
    };
  },

  async attendance(
    f: ReportFilters,
    forcedStatus: 'ABSENT' | 'LATE' | undefined,
    paging?: ReportPaging,
  ): Promise<ReportData> {
    const status = forcedStatus ?? (f.status && f.status in ATT_STATUS_AR ? f.status : undefined);
    const where: Prisma.AttendanceRecordWhereInput = {
      ...(status ? { status: status as Prisma.AttendanceRecordWhereInput['status'] } : {}),
      ...(f.groupId ? { groupId: f.groupId } : {}),
      athlete: f.athleteScope,
      ...(f.athleteId ? { athleteId: f.athleteId } : {}),
      ...(f.dateFrom || f.dateTo
        ? { recordDate: { ...(f.dateFrom ? { gte: f.dateFrom } : {}), ...(f.dateTo ? { lte: f.dateTo } : {}) } }
        : {}),
      // نطاق المجموعات للمدرب المقيّد
      ...(f.restrictedCoachId ? { session: { group: { coachId: f.restrictedCoachId } } } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.attendanceRecord.findMany({
        where,
        include: {
          athlete: { select: { firstName: true, lastName: true, registrationNo: true } },
          session: { select: { title: true, sessionDate: true, group: { select: { name: true } } } },
        },
        orderBy: { recordDate: 'desc' },
        ...(paging ?? {}),
      }),
      prisma.attendanceRecord.count({ where }),
    ]);
    return {
      rows: items.map((r) => ({
        date: day(r.recordDate),
        session: r.session.title,
        athlete: `${r.athlete.firstName} ${r.athlete.lastName}`,
        registrationNo: r.athlete.registrationNo,
        group: r.session.group?.name ?? '',
        status: ATT_STATUS_AR[r.status] ?? r.status,
        minutesLate: r.minutesLate,
        method: r.method,
      })),
      total,
    };
  },

  async coaches(f: ReportFilters, paging?: ReportPaging): Promise<ReportData> {
    const where: Prisma.CoachWhereInput = {
      deletedAt: null,
      ...(f.restrictedCoachId ? { id: f.restrictedCoachId } : {}),
      ...(f.coachId && !f.restrictedCoachId ? { id: f.coachId } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.coach.findMany({
        where,
        include: { groups: { where: { deletedAt: null }, select: { id: true } } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        ...(paging ?? {}),
      }),
      prisma.coach.count({ where }),
    ]);
    return {
      rows: items.map((c) => ({
        name: `${c.firstName} ${c.lastName}`,
        phone: c.phone ?? '',
        email: c.email ?? '',
        specialization: c.specialization ?? '',
        groups: c.groups.length,
        joinedAt: c.joinedAt ? day(c.joinedAt) : '',
        status: c.isActive ? 'نشط' : 'معطّل',
      })),
      total,
    };
  },

  async sports(f: ReportFilters, paging?: ReportPaging): Promise<ReportData> {
    const where: Prisma.SportWhereInput = {
      deletedAt: null,
      ...(f.sportId ? { id: f.sportId } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.sport.findMany({
        where,
        include: {
          groups: { where: { deletedAt: null }, select: { id: true } },
          athletes: { where: { deletedAt: null }, select: { id: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        ...(paging ?? {}),
      }),
      prisma.sport.count({ where }),
    ]);
    return {
      rows: items.map((s) => ({
        name: s.name,
        nameEn: s.nameEn ?? '',
        groups: s.groups.length,
        athletes: s.athletes.length,
        status: s.isActive ? 'نشط' : 'معطّل',
      })),
      total,
    };
  },

  async groups(f: ReportFilters, paging?: ReportPaging): Promise<ReportData> {
    const where: Prisma.GroupWhereInput = {
      deletedAt: null,
      ...f.groupScope,
      ...(f.sportId ? { sportId: f.sportId } : {}),
      ...(f.coachId ? { coachId: f.coachId } : {}),
      ...(f.ageCategoryId ? { ageCategoryId: f.ageCategoryId } : {}),
      ...(f.groupId ? { id: f.groupId } : {}),
      ...(f.status === 'ACTIVE' || f.status === 'INACTIVE'
        ? { status: f.status as Prisma.GroupWhereInput['status'] }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.group.findMany({
        where,
        include: {
          sport: { select: { name: true } },
          coach: { select: { firstName: true, lastName: true } },
          venue: { select: { name: true } },
          members: { where: { leftAt: null }, select: { id: true } },
        },
        orderBy: { name: 'asc' },
        ...(paging ?? {}),
      }),
      prisma.group.count({ where }),
    ]);
    return {
      rows: items.map((g) => ({
        name: g.name,
        code: g.code,
        sport: g.sport.name,
        coach: g.coach ? `${g.coach.firstName} ${g.coach.lastName}` : '',
        venue: g.venue?.name ?? '',
        capacity: g.maxCapacity,
        members: g.members.length,
        schedule: `${g.startTime ?? ''}-${g.endTime ?? ''}`.trim(),
        status: g.status === 'ACTIVE' ? 'نشطة' : 'معطّلة',
      })),
      total,
    };
  },

  /** الإيرادات اليومية (دفعات مكتملة) — تجميع حسب التاريخ. */
  async revenues(f: ReportFilters, paging?: ReportPaging): Promise<ReportData> {
    const where: Prisma.PaymentWhereInput = {
      status: 'COMPLETED',
      ...(f.dateFrom || f.dateTo
        ? { paymentDate: { ...(f.dateFrom ? { gte: f.dateFrom } : {}), ...(f.dateTo ? { lte: f.dateTo } : {}) } }
        : {}),
    };
    const grouped = await prisma.payment.groupBy({
      by: ['paymentDate'],
      where,
      _sum: { netAmount: true, amount: true },
      _count: { _all: true },
      orderBy: { paymentDate: 'asc' },
    });
    const rows: ReportRow[] = grouped.map((g) => ({
      date: day(g.paymentDate),
      count: g._count._all,
      total: money(g._sum.netAmount ?? 0n, f.decimals),
    }));
    const totalAmount = grouped.reduce((a, g) => a + (g._sum.netAmount ?? 0n), 0n);
    const page = paging ? rows.slice(paging.skip, paging.skip + paging.take) : rows;
    return { rows: page, total: rows.length, summary: { totalRevenue: money(totalAmount, f.decimals) } };
  },

  async expenses(f: ReportFilters, paging?: ReportPaging): Promise<ReportData> {
    const status = f.status === 'VOIDED' || f.status === 'ACTIVE' ? f.status : 'ACTIVE';
    const where: Prisma.ExpenseWhereInput = {
      deletedAt: null,
      status: status as Prisma.ExpenseWhereInput['status'],
      ...(f.dateFrom || f.dateTo
        ? { expenseDate: { ...(f.dateFrom ? { gte: f.dateFrom } : {}), ...(f.dateTo ? { lte: f.dateTo } : {}) } }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.expense.findMany({
        where,
        include: { category: { select: { name: true } } },
        orderBy: { expenseDate: 'desc' },
        ...(paging ?? {}),
      }),
      prisma.expense.count({ where }),
    ]);
    return {
      rows: items.map((e) => ({
        date: day(e.expenseDate),
        category: e.category.name,
        description: e.description ?? '',
        beneficiary: e.beneficiary ?? '',
        amount: money(e.amount, f.decimals),
        status: e.status === 'ACTIVE' ? 'نشط' : 'ملغى',
      })),
      total,
    };
  },

  async cash(f: ReportFilters, paging?: ReportPaging): Promise<ReportData> {
    const where: Prisma.CashTransactionWhereInput = {
      ...(f.status && f.status in CASH_TYPE_AR
        ? { type: f.status as Prisma.CashTransactionWhereInput['type'] }
        : {}),
      ...(f.dateFrom || f.dateTo
        ? { txDate: { ...(f.dateFrom ? { gte: f.dateFrom } : {}), ...(f.dateTo ? { lte: f.dateTo } : {}) } }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.cashTransaction.findMany({
        where,
        orderBy: [{ txDate: 'asc' }, { createdAt: 'asc' }],
        ...(paging ?? {}),
      }),
      prisma.cashTransaction.count({ where }),
    ]);
    return {
      rows: items.map((t) => ({
        date: day(t.txDate),
        type: CASH_TYPE_AR[t.type] ?? t.type,
        amount: money(t.amount, f.decimals),
        balanceAfter: money(t.balanceAfter, f.decimals),
        reference: `${t.referenceType ?? ''}${t.referenceId ? `#${t.referenceId.slice(0, 8)}` : ''}`,
        reason: t.reason ?? '',
      })),
      total,
    };
  },
};
