import type { CashClosing, CashTransaction, CashTransactionType, Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { parseDateOnly } from '@/shared/dates';
import type { CashClosingListQuery, CashTransactionListQuery } from './schema';

const SORTABLE_TX = ['txDate', 'createdAt', 'type', 'amount'];
const SORTABLE_CLOSINGS = ['closingDate', 'createdAt'];

function buildTxWhere(query: CashTransactionListQuery): Prisma.CashTransactionWhereInput {
  const where: Prisma.CashTransactionWhereInput = {};
  if (query.type) where.type = query.type;
  if (query.referenceType) where.referenceType = query.referenceType;
  if (query.referenceId) where.referenceId = query.referenceId;
  if (query.dateFrom || query.dateTo) {
    where.txDate = {
      ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
    };
  }
  if (query.q) where.reason = { contains: query.q, mode: 'insensitive' };
  return where;
}

function buildClosingWhere(query: CashClosingListQuery): Prisma.CashClosingWhereInput {
  const where: Prisma.CashClosingWhereInput = {};
  if (query.dateFrom || query.dateTo) {
    where.closingDate = {
      ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
    };
  }
  if (query.q) where.reason = { contains: query.q, mode: 'insensitive' };
  return where;
}

export interface AppendCashEntryData {
  type: CashTransactionType;
  /** المبلغ الموقّع كما يُخزَّن في الدفتر. */
  amount: bigint;
  balanceAfter: bigint;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  txDate: Date;
  createdBy?: string | null;
}

export const cashRepository = {
  async listTransactions(
    query: CashTransactionListQuery,
  ): Promise<{ items: CashTransaction[]; total: number }> {
    const where = buildTxWhere(query);
    const orderBy = toOrderBy(query.sort, SORTABLE_TX);
    const [items, total] = await prisma.$transaction([
      prisma.cashTransaction.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }, { txDate: 'desc' }],
        ...pagination(query),
      }),
      prisma.cashTransaction.count({ where }),
    ]);
    return { items, total };
  },

  async listClosings(query: CashClosingListQuery): Promise<{ items: CashClosing[]; total: number }> {
    const where = buildClosingWhere(query);
    const orderBy = toOrderBy(query.sort, SORTABLE_CLOSINGS);
    const [items, total] = await prisma.$transaction([
      prisma.cashClosing.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : [{ closingDate: 'desc' }],
        ...pagination(query),
      }),
      prisma.cashClosing.count({ where }),
    ]);
    return { items, total };
  },

  /** قفل تسلسلي لكتّاب الدفتر (منع سباق حساب balanceAfter) — استشارة على مستوى المعاملة. */
  async lockLedger(tx: PrismaTransaction): Promise<void> {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(7101, 0)`;
  },

  /** آخر رصيد مسجل (balanceAfter لآخر قيد) — داخل معاملة (يفضَّل بعد القفل). */
  async lastBalance(tx: PrismaTransaction): Promise<bigint | null> {
    const rows = await tx.$queryRaw<{ balance_after: bigint | null }[]>`
      SELECT balance_after FROM cash_transactions
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
    return rows[0]?.balance_after ?? null;
  },

  /** الرصيد كما في نهاية تاريخ معين (لحساب المتوقع عند الإغلاق). */
  async balanceAsOf(date: Date, tx: PrismaTransaction): Promise<bigint | null> {
    const rows = await tx.$queryRaw<{ balance_after: bigint | null }[]>`
      SELECT balance_after FROM cash_transactions
      WHERE tx_date <= ${date}
      ORDER BY tx_date DESC, created_at DESC, id DESC
      LIMIT 1
    `;
    return rows[0]?.balance_after ?? null;
  },

  async createTransaction(data: AppendCashEntryData, tx: PrismaTransaction): Promise<CashTransaction> {
    return tx.cashTransaction.create({
      data: {
        type: data.type,
        amount: data.amount,
        balanceAfter: data.balanceAfter,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
        reason: data.reason ?? null,
        txDate: data.txDate,
        createdBy: data.createdBy ?? null,
      },
    });
  },

  async countByType(type: CashTransactionType, tx?: PrismaTransaction): Promise<number> {
    const client = tx ?? prisma;
    return client.cashTransaction.count({ where: { type } });
  },

  async findLastClosing(tx?: PrismaTransaction): Promise<CashClosing | null> {
    const client = tx ?? prisma;
    return client.cashClosing.findFirst({ orderBy: { closingDate: 'desc' } });
  },

  async findClosingByDate(date: Date, tx?: PrismaTransaction): Promise<CashClosing | null> {
    const client = tx ?? prisma;
    return client.cashClosing.findFirst({ where: { closingDate: date } });
  },

  async createClosing(
    data: {
      closingDate: Date;
      expectedAmount: bigint;
      countedAmount: bigint;
      difference: bigint;
      reason: string | null;
      closedBy: string | null;
    },
    tx: PrismaTransaction,
  ): Promise<CashClosing> {
    return tx.cashClosing.create({ data });
  },
};
