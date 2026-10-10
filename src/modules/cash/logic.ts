/**
 * منطق دفتر الخزينة النقي (7.12) — Append-Only، قابل للاختبار دون قاعدة بيانات.
 * المال BigInt بأصغر وحدة (ممنوع float — 4.4).
 *
 * اصطلاح الإشارات في الجدول:
 * - OPENING_BALANCE / INCOME: موجبة
 * - EXPENSE: سالبة (تُمرَّر للـ signedAmount كقيمة مطلقة)
 * - ADJUSTMENT / REVERSAL: موقّعة حسب الاتجاه (تُمرَّر كما هي)
 */
import { sumMinor, type MinorUnits } from '@/shared/money';

export type CashTransactionTypeValue =
  | 'OPENING_BALANCE'
  | 'INCOME'
  | 'EXPENSE'
  | 'ADJUSTMENT'
  | 'REVERSAL';

export interface LedgerEntry {
  type: CashTransactionTypeValue;
  /** المبلغ كما سيُخزَّن في الدفتر (موقّع). */
  amount: MinorUnits;
}

/** تحويل مبلغ مُدخل (قيمة مطلقة لأنواع الدخل/المصروف/الافتتاحي) إلى مبلغ موقّع للدفتر. */
export function signedAmount(type: CashTransactionTypeValue, input: MinorUnits): MinorUnits {
  switch (type) {
    case 'OPENING_BALANCE':
    case 'INCOME':
      if (input < 0n) throw new Error('مبلغ الدخل/الرصيد الافتتاحي يجب ألا يكون سالبًا');
      return input;
    case 'EXPENSE':
      if (input < 0n) throw new Error('مبلغ المصروف يُمرَّر كقيمة مطلقة');
      return -input;
    case 'ADJUSTMENT':
    case 'REVERSAL':
      return input; // موقّع مسبقًا (تصحيح موجب/سالب)
  }
}

/** الرصيد الحالي = مجموع كل قيود الدفتر الموقّعة (مصدر الحقيقة الوحيد). */
export function computeBalance(entries: readonly LedgerEntry[]): MinorUnits {
  return sumMinor(entries.map((e) => e.amount));
}

/** الرصيد بعد قيد جديد = الرصيد السابق + المبلغ الموقّع (يُخزَّن في balanceAfter). */
export function computeBalanceAfter(
  previousBalance: MinorUnits,
  type: CashTransactionTypeValue,
  input: MinorUnits,
): MinorUnits {
  return previousBalance + signedAmount(type, input);
}

/** مجموع صافي حركات يوم (لإغلاق اليومية). */
export function dayNet(entries: readonly LedgerEntry[]): MinorUnits {
  return sumMinor(entries.map((e) => e.amount));
}

/** فرق الإغلاق = المعدود − المتوقع (موجب = فائض، سالب = عجز). */
export function closingDifference(expected: MinorUnits, counted: MinorUnits): MinorUnits {
  return counted - expected;
}
