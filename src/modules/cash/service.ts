import type { CashClosing, CashTransaction, CashTransactionType } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, businessRule, conflict, validationError } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { toMinorUnits, type MinorUnits } from '@/shared/money';
import { parseDateOnly } from '@/shared/dates';
import { getSettings } from '@/modules/settings/service';
import { cashRepository } from './repository';
import { computeBalanceAfter, closingDifference, signedAmount, type CashTransactionTypeValue } from './logic';
import type {
  AdjustCashInput,
  CashClosingListQuery,
  CashTransactionListQuery,
  CloseDayInput,
  OpeningBalanceInput,
} from './schema';

const big = (v: MinorUnits): string => v.toString();

/** JSON لا يدعم BigInt — يُحوَّل لنص في Audit والـ DTO. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as T;
}

export interface CashTransactionDto {
  id: string;
  type: CashTransactionType;
  /** موقّع (سالب للمصروف/التصحيح السالب). */
  amount: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  txDate: Date;
  createdBy: string | null;
  createdAt: Date;
}

export interface CashClosingDto {
  id: string;
  closingDate: Date;
  expectedAmount: string;
  countedAmount: string;
  difference: string;
  reason: string | null;
  closedBy: string | null;
  closedAt: Date;
}

function toTxDto(t: CashTransaction): CashTransactionDto {
  return {
    id: t.id,
    type: t.type,
    amount: big(t.amount),
    balanceAfter: big(t.balanceAfter),
    referenceType: t.referenceType,
    referenceId: t.referenceId,
    reason: t.reason,
    txDate: t.txDate,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
  };
}

function toClosingDto(c: CashClosing): CashClosingDto {
  return {
    id: c.id,
    closingDate: c.closingDate,
    expectedAmount: big(c.expectedAmount),
    countedAmount: big(c.countedAmount),
    difference: big(c.difference),
    reason: c.reason,
    closedBy: c.closedBy,
    closedAt: c.closedAt,
  };
}

export const cashService = {
  /**
   * رفض أي قيد بتاريخ يوم مقفل (7.12) —
   * بعد الإغلاق اليومي تُقفل حركات ذلك اليوم، والتصحيح بقيد عكسي بتاريخ مفتوح.
   */
  async assertDayOpen(txDate: Date, tx?: PrismaTransaction): Promise<void> {
    const lastClosing = await cashRepository.findLastClosing(tx);
    if (lastClosing && txDate.getTime() <= lastClosing.closingDate.getTime()) {
      throw businessRule(
        `اليوم مقفل (آخر إقفال: ${lastClosing.closingDate.toISOString().slice(0, 10)}) — ` +
          'لا تُعدّل حركات يوم مقفل؛ صحّح بقيد عكسي بتاريخ مفتوح',
        { lastClosingDate: lastClosing.closingDate },
      );
    }
  },

  /**
   * إلحاق قيد بالدفتر (Append-Only) مع قفل تسلسلي وحساب balanceAfter.
   * تُستدعى دائمًا داخل معاملة الوحدة صاحبة العملية (دفعة/مصروف/تسوية).
   * amount قيمة مطلقة لـ INCOME/EXPENSE/OPENING_BALANCE، وموقّعة لـ ADJUSTMENT/REVERSAL.
   */
  async appendEntry(
    tx: PrismaTransaction,
    entry: {
      type: CashTransactionTypeValue;
      amount: MinorUnits;
      referenceType?: string | null;
      referenceId?: string | null;
      reason?: string | null;
      txDate: Date;
      createdBy?: string | null;
    },
  ): Promise<CashTransaction> {
    await cashRepository.lockLedger(tx);
    await cashService.assertDayOpen(entry.txDate, tx);
    const previous = (await cashRepository.lastBalance(tx)) ?? 0n;
    const balanceAfter = computeBalanceAfter(previous, entry.type, entry.amount);
    return cashRepository.createTransaction(
      {
        type: entry.type as CashTransactionType,
        amount: signedAmount(entry.type, entry.amount),
        balanceAfter,
        referenceType: entry.referenceType ?? null,
        referenceId: entry.referenceId ?? null,
        reason: entry.reason ?? null,
        txDate: entry.txDate,
        createdBy: entry.createdBy ?? null,
      },
      tx,
    );
  },

  /** الرصيد الحالي = مجموع الدفتر (balanceAfter لآخر قيد). */
  async computeBalance(): Promise<MinorUnits> {
    return prisma.$transaction(async (tx) => (await cashRepository.lastBalance(tx)) ?? 0n);
  },

  /** الرصيد الافتتاحي — مرة واحدة فقط. */
  async open(input: OpeningBalanceInput, meta: Meta): Promise<CashTransactionDto> {
    const settings = await getSettings();
    const amount = toMinorUnits(input.amount, settings.currencyDecimals);
    if (amount <= 0n) {
      throw validationError({ amount: ['الرصيد الافتتاحي يجب أن يكون أكبر من صفر'] });
    }
    const txDate = parseDateOnly(input.txDate);

    return prisma.$transaction(async (tx) => {
      const existing = await cashRepository.countByType('OPENING_BALANCE', tx);
      if (existing > 0) {
        throw businessRule('تم تسجيل رصيد افتتاحي مسبقًا — استخدم التسوية للتصحيح');
      }
      const entry = await cashService.appendEntry(tx, {
        type: 'OPENING_BALANCE',
        amount,
        referenceType: 'opening',
        reason: input.reason ?? 'رصيد افتتاحي',
        txDate,
        createdBy: meta.user.userId,
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: 'CashTransaction',
          entityId: entry.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: jsonSafe(entry),
          metadata: { operation: 'opening_balance' },
        },
        tx,
      );
      return toTxDto(entry);
    });
  },

  /** تسوية يدوية (cash.adjust) — بسبب إلزامي، موجبة أو سالبة. */
  async adjust(input: AdjustCashInput, meta: Meta): Promise<CashTransactionDto> {
    const settings = await getSettings();
    const amount = toMinorUnits(input.amount, settings.currencyDecimals);
    if (amount === 0n) {
      throw new AppError(ErrorCode.INVALID_AMOUNT, 'مبلغ التسوية يجب ألا يكون صفرًا');
    }
    const txDate = parseDateOnly(input.txDate);

    return prisma.$transaction(async (tx) => {
      const entry = await cashService.appendEntry(tx, {
        type: 'ADJUSTMENT',
        amount, // موقّع (سالب مسموح للتسويات الناقصة)
        referenceType: 'adjustment',
        reason: input.reason,
        txDate,
        createdBy: meta.user.userId,
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: 'CashTransaction',
          entityId: entry.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: jsonSafe(entry),
          metadata: { operation: 'adjustment', reason: input.reason },
        },
        tx,
      );
      return toTxDto(entry);
    });
  },

  /** الإغلاق اليومي: المتوقع من الدفتر مقابل المعدود فعليًا + الفرق (وسببه إلزامي). */
  async closeDay(input: CloseDayInput, meta: Meta): Promise<CashClosingDto> {
    const settings = await getSettings();
    const closingDate = parseDateOnly(input.closingDate);
    const counted = toMinorUnits(input.countedAmount, settings.currencyDecimals);
    if (counted < 0n) {
      throw validationError({ countedAmount: ['المبلغ المعدود لا يمكن أن يكون سالبًا'] });
    }

    return prisma.$transaction(async (tx) => {
      const existing = await cashRepository.findClosingByDate(closingDate, tx);
      if (existing) throw conflict('هذا اليوم مقفل مسبقًا');

      const expected = (await cashRepository.balanceAsOf(closingDate, tx)) ?? 0n;
      const difference = closingDifference(expected, counted);
      if (difference !== 0n && !(input.reason ?? '').trim()) {
        throw validationError({ reason: ['سبب فرق الإغلاق إلزامي عند وجود فرق'] });
      }

      const closing = await cashRepository.createClosing(
        {
          closingDate,
          expectedAmount: expected,
          countedAmount: counted,
          difference,
          reason: input.reason ?? null,
          closedBy: meta.user.userId,
        },
        tx,
      );
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: 'CashClosing',
          entityId: closing.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: jsonSafe(closing),
          metadata: { operation: 'close_day' },
        },
        tx,
      );
      return toClosingDto(closing);
    });
  },

  async listTransactions(
    query: CashTransactionListQuery,
  ): Promise<{ items: CashTransactionDto[]; total: number; balance: string }> {
    const result = await cashRepository.listTransactions(query);
    const balance = await cashService.computeBalance();
    return { items: result.items.map(toTxDto), total: result.total, balance: big(balance) };
  },

  async listClosings(query: CashClosingListQuery): Promise<{ items: CashClosingDto[]; total: number }> {
    const result = await cashRepository.listClosings(query);
    return { items: result.items.map(toClosingDto), total: result.total };
  },
};
