import type { Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { addDays, parseDateOnly } from '@/shared/dates';
import type { SubscriptionListQuery } from './schema';

const SORTABLE = ['startDate', 'endDate', 'dueDate', 'createdAt', 'status', 'price', 'netAmount', 'paidAmount'];

export const subscriptionInclude = {
  subscriptionType: { select: { id: true, name: true, kind: true, durationDays: true, sessionsTotal: true } },
  athlete: { select: { id: true, registrationNo: true, firstName: true, lastName: true } },
  group: { select: { id: true, name: true } },
} as const;

export type SubscriptionRow = Prisma.SubscriptionGetPayload<{ include: typeof subscriptionInclude }>;

export interface SubscriptionListResult {
  items: SubscriptionRow[];
  total: number;
}

function buildWhere(query: SubscriptionListQuery, today: Date): Prisma.SubscriptionWhereInput {
  const where: Prisma.SubscriptionWhereInput = { deletedAt: null };
  if (query.athleteId) where.athleteId = query.athleteId;
  if (query.sportId) where.sportId = query.sportId;
  if (query.groupId) where.groupId = query.groupId;
  if (query.subscriptionTypeId) where.subscriptionTypeId = query.subscriptionTypeId;
  if (query.status) where.status = query.status;
  if (query.dueBefore) where.dueDate = { lte: parseDateOnly(query.dueBefore) };
  if (query.expiringWithinDays) {
    where.status = 'ACTIVE';
    where.endDate = { lte: addDays(today, query.expiringWithinDays) };
  }
  if (query.q) {
    where.athlete = {
      OR: [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { registrationNo: { contains: query.q, mode: 'insensitive' } },
      ],
    };
  }
  return where;
}

export const subscriptionRepository = {
  async list(query: SubscriptionListQuery, today: Date): Promise<SubscriptionListResult> {
    const where = buildWhere(query, today);
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.subscription.findMany({
        where,
        include: subscriptionInclude,
        orderBy: orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.subscription.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<SubscriptionRow | null> {
    const client = tx ?? prisma;
    return client.subscription.findFirst({ where: { id, deletedAt: null }, include: subscriptionInclude });
  },

  /** اشتراك نشط آخر لنفس (رياضي، نشاط) — منع ازدواج الاشتراك (7.9). */
  async findActiveForAthleteSport(
    athleteId: string,
    sportId: string | null,
    excludeId: string | undefined,
    tx?: PrismaTransaction,
  ): Promise<SubscriptionRow | null> {
    const client = tx ?? prisma;
    return client.subscription.findFirst({
      where: {
        athleteId,
        sportId,
        status: 'ACTIVE',
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: subscriptionInclude,
    });
  },

  /** مجموع الدفعات غير الملغاة لاشتراك (مصدر الحقيقة — 7.11). */
  async sumNonVoidedPayments(subscriptionId: string, tx?: PrismaTransaction): Promise<bigint> {
    const client = tx ?? prisma;
    const agg = await client.payment.aggregate({
      where: { subscriptionId, status: 'COMPLETED', voidedAt: null },
      _sum: { netAmount: true },
    });
    return agg._sum.netAmount ?? 0n;
  },

  /** قفل صف الاشتراك داخل معاملة (SELECT ... FOR UPDATE) لمنع سباق الدفعات المتزامنة. */
  async lockRow(id: string, tx: PrismaTransaction): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscriptions WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE
    `;
    return rows.length > 0;
  },

  /** عدد الاشتراكات المرتبطة بنوع (لفحص الحذف في subscription-types). */
  async countByAthlete(athleteId: string, tx?: PrismaTransaction): Promise<number> {
    const client = tx ?? prisma;
    return client.subscription.count({ where: { athleteId, deletedAt: null } });
  },

  /** الاشتراكات النشطة التي تجاوزت تاريخ نهايتها (لمهمة auto-expire — 7.10). */
  async markExpiredBefore(today: Date, updatedBy: string, tx: PrismaTransaction): Promise<number> {
    const res = await tx.subscription.updateMany({
      where: { status: 'ACTIVE', deletedAt: null, endDate: { lt: today } },
      data: { status: 'EXPIRED', updatedBy, version: { increment: 1 } },
    });
    return res.count;
  },
};
