import type { Prisma } from '@prisma/client';
import { lockNamed, prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { parseDateOnly } from '@/shared/dates';
import type { PaymentListQuery } from './schema';

const SORTABLE = ['paymentDate', 'createdAt', 'amount', 'netAmount', 'status'];

export const paymentInclude = {
  paymentMethod: { select: { id: true, name: true } },
  athlete: { select: { id: true, registrationNo: true, firstName: true, lastName: true } },
  subscription: {
    select: {
      id: true,
      netAmount: true,
      paidAmount: true,
      status: true,
      startDate: true,
      endDate: true,
      subscriptionType: { select: { id: true, name: true } },
    },
  },
  receipt: { select: { id: true, receiptNo: true, status: true } },
} as const;

export type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

function buildWhere(query: PaymentListQuery): Prisma.PaymentWhereInput {
  const where: Prisma.PaymentWhereInput = {};
  if (query.athleteId) where.athleteId = query.athleteId;
  if (query.subscriptionId) where.subscriptionId = query.subscriptionId;
  if (query.status) where.status = query.status;
  if (query.paymentMethodId) where.paymentMethodId = query.paymentMethodId;
  if (query.dateFrom || query.dateTo) {
    where.paymentDate = {
      ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
    };
  }
  if (query.q) where.transactionNo = { contains: query.q };
  return where;
}

export const paymentRepository = {
  async list(query: PaymentListQuery): Promise<{ items: PaymentRow[]; total: number }> {
    const where = buildWhere(query);
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: orderBy.length > 0 ? orderBy : [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.payment.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<PaymentRow | null> {
    const client = tx ?? prisma;
    return client.payment.findFirst({ where: { id }, include: paymentInclude });
  },

  async findByIdempotencyKey(key: string): Promise<PaymentRow | null> {
    return prisma.payment.findFirst({ where: { idempotencyKey: key }, include: paymentInclude });
  },

  /** قفل صف الاشتراك (SELECT ... FOR UPDATE) — منع سباق الدفعات المتزامنة (7.11). */
  async lockSubscription(subscriptionId: string, tx: PrismaTransaction): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscriptions WHERE id = ${subscriptionId} AND deleted_at IS NULL FOR UPDATE
    `;
    return rows.length > 0;
  },

  /** مجموع صافي الدفعات غير الملغاة (مصدر الحقيقة للمدفوع — 7.11). */
  async sumNonVoided(subscriptionId: string, tx: PrismaTransaction): Promise<bigint> {
    const agg = await tx.payment.aggregate({
      where: { subscriptionId, status: 'COMPLETED', voidedAt: null },
      _sum: { netAmount: true },
    });
    return agg._sum.netAmount ?? 0n;
  },

  /** قفل تسلسلي لأرقام الحركات + عدّاد الدفعات (توليد transactionNo). */
  async lockTransactionSequence(fiscalYear: number, tx: PrismaTransaction): Promise<number> {
    await lockNamed(tx, `payments:${fiscalYear}`);
    return (await tx.payment.count()) + 1;
  },

  async findMethodById(id: string, tx: PrismaTransaction) {
    return tx.paymentMethod.findFirst({ where: { id, isActive: true } });
  },

  async findSubscriptionById(id: string, tx: PrismaTransaction) {
    return tx.subscription.findFirst({
      where: { id, deletedAt: null },
      include: { subscriptionType: { select: { id: true, name: true } } },
    });
  },
};
