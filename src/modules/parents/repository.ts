import type { Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { normalizeArabic, escapeLike } from '@/shared/text/normalize';
import type { ParentAthleteLink, ParentListQuery } from './schema';

type Db = typeof prisma | PrismaTransaction;

const SORTABLE = ['firstName', 'lastName', 'phone', 'createdAt'];

export const PARENT_INCLUDE = {
  athleteParents: {
    select: {
      id: true,
      relationship: true,
      isPrimary: true,
      isPayer: true,
      isEmergency: true,
      athlete: {
        select: { id: true, registrationNo: true, firstName: true, lastName: true, birthDate: true, status: true, deletedAt: true },
      },
    },
  },
} satisfies Prisma.ParentInclude;

export type ParentWithLinks = Prisma.ParentGetPayload<{ include: typeof PARENT_INCLUDE }>;

export interface ParentListResult {
  items: ParentWithLinks[];
  total: number;
}

export interface ChildSubscriptionRow {
  id: string;
  athleteId: string;
  netAmount: bigint;
}

function buildWhere(query: ParentListQuery): Prisma.ParentWhereInput {
  const where: Prisma.ParentWhereInput = {};
  if (query.includeDeleted !== 'true') where.deletedAt = null;
  if (query.q) {
    const q = escapeLike(normalizeArabic(query.q));
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: query.q, mode: 'insensitive' } },
      { phone2: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/** استعلامات الأولياء — Prisma فقط + النطاق (4.2). */
export const parentRepository = {
  async list(query: ParentListQuery): Promise<ParentListResult> {
    const where = buildWhere(query);
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.parent.findMany({
        where,
        include: PARENT_INCLUDE,
        orderBy: orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.parent.count({ where }),
    ]);
    return { items, total };
  },

  findById(id: string, opts: { includeDeleted?: boolean } = {}, db: Db = prisma): Promise<ParentWithLinks | null> {
    return db.parent.findFirst({
      where: opts.includeDeleted ? { id } : { id, deletedAt: null },
      include: PARENT_INCLUDE,
    });
  },

  /** كل الأولياء غير المحذوفين (مرشحو كشف التكرار بالهاتف). */
  findAllActiveForDuplicateCheck(db: Db = prisma) {
    return db.parent.findMany({
      where: { deletedAt: null },
      select: { id: true, firstName: true, lastName: true, phone: true, phone2: true },
    });
  },

  create(data: Prisma.ParentUncheckedCreateInput, db: Db = prisma): Promise<ParentWithLinks> {
    return db.parent.create({ data, include: PARENT_INCLUDE });
  },

  async updateWithVersion(
    id: string,
    version: number,
    data: Prisma.ParentUncheckedUpdateInput,
    db: Db = prisma,
  ): Promise<number> {
    const res = await db.parent.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    return res.count;
  },

  /** استبدال روابط الأبناء (داخل Transaction). */
  async setAthleteLinks(parentId: string, links: ParentAthleteLink[], db: Db = prisma): Promise<void> {
    await db.athleteParent.deleteMany({ where: { parentId } });
    if (links.length > 0) {
      await db.athleteParent.createMany({
        data: links.map((l) => ({
          parentId,
          athleteId: l.athleteId,
          relationship: l.relationship ?? null,
          isPrimary: l.isPrimary ?? false,
          isPayer: l.isPayer ?? false,
          isEmergency: l.isEmergency ?? false,
        })),
      });
    }
  },

  async softDelete(id: string, version: number, deletedAt: Date, updatedBy: string, db: Db = prisma): Promise<number> {
    const res = await db.parent.updateMany({
      where: { id, version, deletedAt: null },
      data: { deletedAt, updatedBy, version: { increment: 1 } },
    });
    return res.count;
  },

  /** أبناء الولي (رياضيون غير محذوفين) — معروضون في الملف الشخصي. */
  findChildren(parentId: string, db: Db = prisma) {
    return db.athleteParent.findMany({
      where: { parentId, athlete: { deletedAt: null } },
      select: {
        relationship: true,
        isPrimary: true,
        isPayer: true,
        isEmergency: true,
        athlete: {
          select: {
            id: true,
            registrationNo: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            status: true,
            sport: { select: { id: true, name: true } },
          },
        },
      },
    });
  },

  /** اشتراكات أبناء الولي غير الملغاة (لحساب الديون). */
  findChildrenSubscriptions(athleteIds: string[], db: Db = prisma): Promise<ChildSubscriptionRow[]> {
    if (athleteIds.length === 0) return Promise.resolve([]);
    return db.subscription.findMany({
      where: { athleteId: { in: athleteIds }, deletedAt: null, status: { not: 'CANCELLED' } },
      select: { id: true, athleteId: true, netAmount: true },
    });
  },

  /** مجموع الدفعات غير الملغاة لكل اشتراك (مصدر الحقيقة — 7.11). */
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

  async countAthleteLinks(parentId: string, db: Db = prisma): Promise<number> {
    return db.athleteParent.count({ where: { parentId, athlete: { deletedAt: null } } });
  },

  async assertAthletesExist(athleteIds: string[], db: Db = prisma): Promise<number> {
    if (athleteIds.length === 0) return 0;
    return db.athlete.count({ where: { id: { in: athleteIds }, deletedAt: null } });
  },
};
