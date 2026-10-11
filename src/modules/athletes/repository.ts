import type { AttendanceStatus, AuditAction, Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { normalizeArabic, escapeLike } from '@/shared/text/normalize';
import type { AthleteListQuery, AthleteParentLink } from './schema';

type Db = typeof prisma | PrismaTransaction;

const SORTABLE = ['registrationNo', 'firstName', 'lastName', 'birthDate', 'registrationDate', 'createdAt', 'status'];

/** تضمين التفاصيل الكاملة للرياضي (بدون scanCodeHash). */
export const ATHLETE_INCLUDE = {
  sport: { select: { id: true, name: true, color: true } },
  ageCategory: { select: { id: true, name: true, kind: true, minAge: true, maxAge: true } },
  parents: {
    select: {
      id: true,
      relationship: true,
      isPrimary: true,
      isPayer: true,
      isEmergency: true,
      parent: { select: { id: true, firstName: true, lastName: true, phone: true, phone2: true } },
    },
  },
} satisfies Prisma.AthleteInclude;

export type AthleteWithDetails = Prisma.AthleteGetPayload<{ include: typeof ATHLETE_INCLUDE }>;

export interface AthleteListResult {
  items: AthleteWithDetails[];
  total: number;
}

/** مرشح لكشف التكرار — الحقول المطلوبة في المنطق النقي فقط. */
export interface DuplicateCandidateRow {
  id: string;
  registrationNo: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  phone: string | null;
  parents: { parent: { phone: string; phone2: string | null } }[];
}

const CANDIDATE_SELECT = {
  id: true,
  registrationNo: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  phone: true,
  parents: { select: { parent: { select: { phone: true, phone2: true } } } },
} satisfies Prisma.AthleteSelect;

function buildWhere(query: AthleteListQuery): Prisma.AthleteWhereInput {
  const where: Prisma.AthleteWhereInput = {};
  if (query.includeDeleted !== 'true') where.deletedAt = null;
  if (query.status) where.status = query.status;
  if (query.sportId) where.sportId = query.sportId;
  if (query.ageCategoryId) where.ageCategoryId = query.ageCategoryId;
  if (query.gender) where.gender = query.gender;
  if (query.groupId) {
    where.groupMembers = { some: { groupId: query.groupId, leftAt: null } };
  }
  if (query.q) {
    const q = escapeLike(normalizeArabic(query.q));
    // بحث متسامح: مطابق خام + مطابق بعد التطبيع العربي (ألف/ياء/تاء مربوطة/تشكيل)
    where.OR = [
      { registrationNo: { contains: query.q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: query.q } },
      { phone: { contains: query.q } },
    ];
  }
  return where;
}

/** استعلامات الرياضيين — Prisma فقط + النطاق (4.2). */
export const athleteRepository = {
  async list(query: AthleteListQuery): Promise<AthleteListResult> {
    const where = buildWhere(query);
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.athlete.findMany({
        where,
        include: ATHLETE_INCLUDE,
        orderBy: orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.athlete.count({ where }),
    ]);
    return { items, total };
  },

  findById(id: string, opts: { includeDeleted?: boolean } = {}, db: Db = prisma): Promise<AthleteWithDetails | null> {
    return db.athlete.findFirst({
      where: opts.includeDeleted ? { id } : { id, deletedAt: null },
      include: ATHLETE_INCLUDE,
    });
  },

  /** كل أرقام التسجيل (تشمل المحذوفة — القيد الفريد يغطيها جميعًا). */
  findAllRegistrationNumbers(db: Db = prisma): Promise<string[]> {
    return db.athlete.findMany({ select: { registrationNo: true } }).then((rows) => rows.map((r) => r.registrationNo));
  },

  create(data: Prisma.AthleteUncheckedCreateInput, db: Db = prisma): Promise<AthleteWithDetails> {
    return db.athlete.create({ data, include: ATHLETE_INCLUDE });
  },

  async updateWithVersion(
    id: string,
    version: number,
    data: Prisma.AthleteUncheckedUpdateInput,
    db: Db = prisma,
  ): Promise<number> {
    const res = await db.athlete.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    return res.count;
  },

  /** استبدال روابط الأولياء (داخل Transaction). */
  async setParentLinks(athleteId: string, links: AthleteParentLink[], db: Db = prisma): Promise<void> {
    await db.athleteParent.deleteMany({ where: { athleteId } });
    if (links.length > 0) {
      await db.athleteParent.createMany({
        data: links.map((l) => ({
          athleteId,
          parentId: l.parentId,
          relationship: l.relationship ?? null,
          isPrimary: l.isPrimary ?? false,
          isPayer: l.isPayer ?? false,
          isEmergency: l.isEmergency ?? false,
        })),
      });
    }
  },

  async softDelete(id: string, version: number, deletedAt: Date, updatedBy: string, db: Db = prisma): Promise<number> {
    const res = await db.athlete.updateMany({
      where: { id, version, deletedAt: null },
      data: { deletedAt, updatedBy, version: { increment: 1 } },
    });
    return res.count;
  },

  async restore(id: string, updatedBy: string, db: Db = prisma): Promise<number> {
    const res = await db.athlete.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null, updatedBy, version: { increment: 1 } },
    });
    return res.count;
  },

  /**
   * مرشحو التكرار بالاسم (الاسم شرط لازم في كل قواعد التكرار —
   * المقارنة النهائية لتاريخ الميلاد/الهواتف في المنطق النقي detectAthleteDuplicates).
   */
  findByNameParts(
    firstName: string,
    lastName: string,
    excludeId: string | undefined,
    db: Db = prisma,
  ): Promise<DuplicateCandidateRow[]> {
    const first = escapeLike(normalizeArabic(firstName));
    const last = escapeLike(normalizeArabic(lastName));
    return db.athlete.findMany({
      where: {
        deletedAt: null,
        firstName: { contains: first },
        lastName: { contains: last },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: CANDIDATE_SELECT,
    });
  },

  // ---------- تجميع الملف الشخصي (Profile) ----------

  findSubscriptions(athleteId: string, db: Db = prisma) {
    return db.subscription.findMany({
      where: { athleteId, deletedAt: null },
      include: {
        subscriptionType: { select: { id: true, name: true, kind: true } },
        group: { select: { id: true, name: true, code: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  },

  findPayments(athleteId: string, db: Db = prisma) {
    return db.payment.findMany({
      where: { athleteId },
      include: {
        paymentMethod: { select: { id: true, name: true } },
        subscription: { select: { id: true, startDate: true, endDate: true } },
      },
      orderBy: { paymentDate: 'desc' },
    });
  },

  /** مدفوعات غير ملغاة مجمّعة لكل اشتراك (مصدر الحقيقة للحساب — 7.11). */
  async sumNonVoidedPaymentsBySubscription(subscriptionIds: string[], db: Db = prisma): Promise<Record<string, bigint>> {
    if (subscriptionIds.length === 0) return {};
    const grouped = await db.payment.groupBy({
      by: ['subscriptionId'],
      where: { subscriptionId: { in: subscriptionIds }, status: 'COMPLETED', voidedAt: null },
      _sum: { netAmount: true },
    });
    const out: Record<string, bigint> = {};
    for (const g of grouped) out[g.subscriptionId] = g._sum.netAmount ?? 0n;
    return out;
  },

  async countAttendanceByStatus(athleteId: string, db: Db = prisma): Promise<Record<AttendanceStatus, number>> {
    const grouped = await db.attendanceRecord.groupBy({
      by: ['status'],
      where: { athleteId },
      _count: { _all: true },
    });
    const out = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as Record<AttendanceStatus, number>;
    for (const g of grouped) out[g.status] = g._count._all;
    return out;
  },

  findGroupMemberships(athleteId: string, db: Db = prisma) {
    return db.groupMember.findMany({
      where: { athleteId, group: { deletedAt: null } },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            sport: { select: { id: true, name: true } },
            coach: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
  },

  findEvaluations(athleteId: string, db: Db = prisma) {
    return db.evaluation.findMany({
      where: { athleteId, deletedAt: null },
      include: {
        template: { select: { id: true, name: true, criteria: true } },
        coach: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { evaluationDate: 'desc' },
      take: 20,
    });
  },

  findDocuments(athleteId: string, db: Db = prisma) {
    return db.athleteDocument.findMany({
      where: { athleteId, deletedAt: null },
      include: { documentType: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** الخط الزمني من سجل التدقيق (Append-Only). */
  findTimeline(athleteId: string, take = 50, db: Db = prisma) {
    return db.auditLog.findMany({
      where: { entityType: 'Athlete', entityId: athleteId },
      select: {
        id: true,
        action: true,
        userId: true,
        requestId: true,
        ipAddress: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },
};

export type TimelineAction = AuditAction;
