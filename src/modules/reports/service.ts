/**
 * محرك التقارير (7.14):
 * - صفوف من استعلامات حقيقية لكل نوع تقرير + فلاتر موحّدة.
 * - احترام الصلاحيات (reports.view / reports.view_finance) ونطاق البيانات
 *   (المدرب المقيّد يصدّر بياناته فقط — يُطبَّق داخل المستودع).
 * - تصدير CSV (UTF-8 BOM + تدفق للدفعات الكبيرة) وExcel (RTL عبر exceljs)،
 *   مع تعقيم حقن CSV (shared/export). كل تصدير يُسجَّل EXPORT في Audit.
 */
import type { Prisma } from '@prisma/client';
import { writeAudit } from '@/shared/audit';
import { parseDateOnly } from '@/shared/dates';
import { buildXlsx } from '@/shared/export/excel';
import { streamCsv, type ExportColumn } from '@/shared/export/csv';
import {
  athleteScopeWhere,
  groupScopeWhere,
  isScopeRestricted,
  toScoped,
} from '@/shared/permissions/scope';
import type { AuthContext } from '@/shared/permissions/guard';
import { getSettings } from '@/modules/settings/service';
import type { Meta } from '@/shared/api/meta';
import { reportRepository, type ReportData, type ReportFilters, type ReportRow } from './repository';
import { isFinanceReport, type ReportExportQuery, type ReportQuery, type ReportType } from './schema';

/** ترويسات عربية لكل تقرير. */
export const REPORT_COLUMNS: Record<ReportType, ExportColumn[]> = {
  athletes: [
    { key: 'registrationNo', label: 'رقم التسجيل' },
    { key: 'name', label: 'الاسم' },
    { key: 'gender', label: 'الجنس' },
    { key: 'birthDate', label: 'تاريخ الميلاد' },
    { key: 'age', label: 'العمر' },
    { key: 'sport', label: 'النشاط' },
    { key: 'groups', label: 'المجموعات' },
    { key: 'phone', label: 'الهاتف' },
    { key: 'email', label: 'البريد الإلكتروني' },
    { key: 'status', label: 'الحالة' },
    { key: 'registrationDate', label: 'تاريخ التسجيل' },
  ],
  subscriptions: [
    { key: 'athlete', label: 'الرياضي' },
    { key: 'registrationNo', label: 'رقم التسجيل' },
    { key: 'type', label: 'نوع الاشتراك' },
    { key: 'startDate', label: 'البداية' },
    { key: 'endDate', label: 'النهاية' },
    { key: 'price', label: 'السعر' },
    { key: 'net', label: 'الصافي' },
    { key: 'paid', label: 'المدفوع' },
    { key: 'remaining', label: 'المتبقي' },
    { key: 'dueDate', label: 'الاستحقاق' },
    { key: 'status', label: 'الحالة' },
  ],
  payments: [
    { key: 'transactionNo', label: 'رقم العملية' },
    { key: 'paymentDate', label: 'التاريخ' },
    { key: 'athlete', label: 'الرياضي' },
    { key: 'registrationNo', label: 'رقم التسجيل' },
    { key: 'method', label: 'طريقة الدفع' },
    { key: 'amount', label: 'المبلغ' },
    { key: 'discount', label: 'الخصم' },
    { key: 'net', label: 'الصافي' },
    { key: 'status', label: 'الحالة' },
  ],
  debts: [
    { key: 'athlete', label: 'الرياضي' },
    { key: 'registrationNo', label: 'رقم التسجيل' },
    { key: 'type', label: 'نوع الاشتراك' },
    { key: 'net', label: 'الصافي' },
    { key: 'paid', label: 'المدفوع' },
    { key: 'remaining', label: 'المتبقي' },
    { key: 'dueDate', label: 'الاستحقاق' },
    { key: 'daysOverdue', label: 'أيام التأخر' },
    { key: 'aging', label: 'شريحة العمر' },
  ],
  attendance: [
    { key: 'date', label: 'التاريخ' },
    { key: 'session', label: 'الحصة' },
    { key: 'athlete', label: 'الرياضي' },
    { key: 'registrationNo', label: 'رقم التسجيل' },
    { key: 'group', label: 'المجموعة' },
    { key: 'status', label: 'الحالة' },
    { key: 'minutesLate', label: 'دقائق التأخر' },
    { key: 'method', label: 'طريقة التسجيل' },
  ],
  absence: [
    { key: 'date', label: 'التاريخ' },
    { key: 'session', label: 'الحصة' },
    { key: 'athlete', label: 'الرياضي' },
    { key: 'registrationNo', label: 'رقم التسجيل' },
    { key: 'group', label: 'المجموعة' },
    { key: 'status', label: 'الحالة' },
    { key: 'minutesLate', label: 'دقائق التأخر' },
    { key: 'method', label: 'طريقة التسجيل' },
  ],
  late: [
    { key: 'date', label: 'التاريخ' },
    { key: 'session', label: 'الحصة' },
    { key: 'athlete', label: 'الرياضي' },
    { key: 'registrationNo', label: 'رقم التسجيل' },
    { key: 'group', label: 'المجموعة' },
    { key: 'status', label: 'الحالة' },
    { key: 'minutesLate', label: 'دقائق التأخر' },
    { key: 'method', label: 'طريقة التسجيل' },
  ],
  coaches: [
    { key: 'name', label: 'المدرب' },
    { key: 'phone', label: 'الهاتف' },
    { key: 'email', label: 'البريد الإلكتروني' },
    { key: 'specialization', label: 'التخصص' },
    { key: 'groups', label: 'عدد المجموعات' },
    { key: 'joinedAt', label: 'تاريخ الالتحاق' },
    { key: 'status', label: 'الحالة' },
  ],
  sports: [
    { key: 'name', label: 'النشاط' },
    { key: 'nameEn', label: 'الاسم اللاتيني' },
    { key: 'groups', label: 'المجموعات' },
    { key: 'athletes', label: 'الرياضيون' },
    { key: 'status', label: 'الحالة' },
  ],
  groups: [
    { key: 'name', label: 'المجموعة' },
    { key: 'code', label: 'الرمز' },
    { key: 'sport', label: 'النشاط' },
    { key: 'coach', label: 'المدرب' },
    { key: 'venue', label: 'المكان' },
    { key: 'capacity', label: 'السعة' },
    { key: 'members', label: 'الأعضاء' },
    { key: 'schedule', label: 'المواعيد' },
    { key: 'status', label: 'الحالة' },
  ],
  revenues: [
    { key: 'date', label: 'التاريخ' },
    { key: 'count', label: 'عدد الدفعات' },
    { key: 'total', label: 'الإجمالي' },
  ],
  expenses: [
    { key: 'date', label: 'التاريخ' },
    { key: 'category', label: 'الفئة' },
    { key: 'description', label: 'البيان' },
    { key: 'beneficiary', label: 'المستفيد' },
    { key: 'amount', label: 'المبلغ' },
    { key: 'status', label: 'الحالة' },
  ],
  cash: [
    { key: 'date', label: 'التاريخ' },
    { key: 'type', label: 'النوع' },
    { key: 'amount', label: 'المبلغ' },
    { key: 'balanceAfter', label: 'الرصيد بعد الحركة' },
    { key: 'reference', label: 'المرجع' },
    { key: 'reason', label: 'السبب' },
  ],
};

/** الحد الأقصى لصفوف XLSX (يُبنى في الذاكرة) — CSV بلا حد (بث). */
export const XLSX_MAX_ROWS = 100_000;
const EXPORT_BATCH_SIZE = 1000;

async function buildFilters(user: AuthContext, query: ReportQuery): Promise<ReportFilters> {
  const settings = await getSettings();
  const scoped = toScoped(user);
  const athleteScope: Prisma.AthleteWhereInput = await athleteScopeWhere(scoped);
  const groupScope: Prisma.GroupWhereInput = await groupScopeWhere(scoped);
  return {
    ...(query.dateFrom ? { dateFrom: parseDateOnly(query.dateFrom) } : {}),
    ...(query.dateTo ? { dateTo: endOfDay(parseDateOnly(query.dateTo)) } : {}),
    ...(query.sportId ? { sportId: query.sportId } : {}),
    ...(query.groupId ? { groupId: query.groupId } : {}),
    ...(query.coachId ? { coachId: query.coachId } : {}),
    ...(query.ageCategoryId ? { ageCategoryId: query.ageCategoryId } : {}),
    ...(query.athleteId ? { athleteId: query.athleteId } : {}),
    ...(query.status ? { status: query.status } : {}),
    athleteScope,
    groupScope,
    restrictedCoachId: isScopeRestricted(scoped) ? scoped.linkedCoachId : null,
    decimals: settings.currencyDecimals,
  };
}

function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setUTCHours(23, 59, 59, 999);
  return e;
}

async function fetchReport(
  type: ReportType,
  filters: ReportFilters,
  paging?: { skip: number; take: number },
): Promise<ReportData> {
  switch (type) {
    case 'athletes':
      return reportRepository.athletes(filters, paging);
    case 'subscriptions':
      return reportRepository.subscriptions(filters, paging);
    case 'payments':
      return reportRepository.payments(filters, paging);
    case 'debts':
      return reportRepository.debts(filters, paging);
    case 'attendance':
      return reportRepository.attendance(filters, undefined, paging);
    case 'absence':
      return reportRepository.attendance(filters, 'ABSENT', paging);
    case 'late':
      return reportRepository.attendance(filters, 'LATE', paging);
    case 'coaches':
      return reportRepository.coaches(filters, paging);
    case 'sports':
      return reportRepository.sports(filters, paging);
    case 'groups':
      return reportRepository.groups(filters, paging);
    case 'revenues':
      return reportRepository.revenues(filters, paging);
    case 'expenses':
      return reportRepository.expenses(filters, paging);
    case 'cash':
      return reportRepository.cash(filters, paging);
  }
}

export interface ReportResult {
  type: ReportType;
  columns: ExportColumn[];
  rows: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
  summary?: Record<string, unknown>;
}

export interface ExportFileResult {
  fileName: string;
  mimeType: string;
  /** بث CSV (للأحجام الكبيرة) أو Buffer كامل لـ XLSX. */
  stream?: ReadableStream<Uint8Array>;
  bytes?: Buffer;
}

export const reportService = {
  isFinanceReport,

  async getReport(type: ReportType, query: ReportQuery, user: AuthContext): Promise<ReportResult> {
    const filters = await buildFilters(user, query);
    const data = await fetchReport(type, filters, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return {
      type,
      columns: REPORT_COLUMNS[type],
      rows: data.rows,
      total: data.total,
      page: query.page,
      pageSize: query.pageSize,
      ...(data.summary ? { summary: data.summary } : {}),
    };
  },

  /**
   * تصدير كامل (بلا ترقيم) — CSV يُبَثّ دفعات، XLSX يُبنى في الذاكرة حتى XLSX_MAX_ROWS.
   * يُسجَّل EXPORT في Audit قبل البدء.
   */
  async exportReport(
    type: ReportType,
    query: ReportExportQuery,
    user: AuthContext,
    meta: Meta,
  ): Promise<ExportFileResult> {
    const filters = await buildFilters(user, query);
    const columns = REPORT_COLUMNS[type];
    const stamp = new Date().toISOString().slice(0, 10);
    const ext = query.format === 'xlsx' ? 'xlsx' : 'csv';
    const fileName = `report-${type}-${stamp}.${ext}`;

    await writeAudit({
      userId: user.userId,
      action: 'EXPORT',
      entityType: 'Report',
      entityId: type,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        reportType: type,
        format: ext,
        filters: {
          dateFrom: query.dateFrom ?? null,
          dateTo: query.dateTo ?? null,
          sportId: query.sportId ?? null,
          groupId: query.groupId ?? null,
          coachId: query.coachId ?? null,
          ageCategoryId: query.ageCategoryId ?? null,
          athleteId: query.athleteId ?? null,
          status: query.status ?? null,
        },
        scoped: filters.restrictedCoachId !== null,
      },
    });

    const fetchBatch = async (offset: number, limit: number): Promise<ReportRow[]> => {
      const data = await fetchReport(type, filters, { skip: offset, take: limit });
      return data.rows;
    };

    if (query.format === 'xlsx') {
      const allRows: ReportRow[] = [];
      for (let offset = 0; offset < XLSX_MAX_ROWS; offset += EXPORT_BATCH_SIZE) {
        const batch = await fetchBatch(offset, EXPORT_BATCH_SIZE);
        allRows.push(...batch);
        if (batch.length < EXPORT_BATCH_SIZE) break;
      }
      const bytes = await buildXlsx(reportSheetName(type), columns, allRows, { rtl: true });
      return {
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        bytes,
      };
    }

    return {
      fileName,
      mimeType: 'text/csv; charset=utf-8',
      stream: streamCsv(columns, fetchBatch, { batchSize: EXPORT_BATCH_SIZE }),
    };
  },
};

function reportSheetName(type: ReportType): string {
  const names: Record<ReportType, string> = {
    athletes: 'الرياضيون',
    subscriptions: 'الاشتراكات',
    payments: 'المدفوعات',
    debts: 'الديون',
    attendance: 'الحضور',
    absence: 'الغياب',
    late: 'التأخر',
    coaches: 'المدربون',
    sports: 'الأنشطة',
    groups: 'المجموعات',
    revenues: 'الإيرادات',
    expenses: 'المصاريف',
    cash: 'الخزينة',
  };
  return names[type];
}
