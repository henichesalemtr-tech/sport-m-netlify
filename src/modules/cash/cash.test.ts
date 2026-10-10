import { describe, expect, it } from 'vitest';
import {
  closingDifference,
  computeBalance,
  computeBalanceAfter,
  signedAmount,
  type LedgerEntry,
} from './logic';

describe('إشارات قيود الدفتر (7.12)', () => {
  it('رصيد افتتاحي ودخل → موجبة', () => {
    expect(signedAmount('OPENING_BALANCE', 10000n)).toBe(10000n);
    expect(signedAmount('INCOME', 2500n)).toBe(2500n);
  });

  it('مصروف يُمرَّر كقيمة مطلقة ويُقيَّد سالبًا', () => {
    expect(signedAmount('EXPENSE', 700n)).toBe(-700n);
    expect(() => signedAmount('EXPENSE', -700n)).toThrow();
  });

  it('الدخل السالب مرفوض', () => {
    expect(() => signedAmount('INCOME', -1n)).toThrow();
    expect(() => signedAmount('OPENING_BALANCE', -1n)).toThrow();
  });

  it('التسوية والعكس موقّعة حسب الاتجاه', () => {
    expect(signedAmount('ADJUSTMENT', 500n)).toBe(500n);
    expect(signedAmount('ADJUSTMENT', -500n)).toBe(-500n);
    expect(signedAmount('REVERSAL', -2500n)).toBe(-2500n);
  });
});

describe('حساب الرصيد من الدفتر (Append-Only)', () => {
  const ledger: LedgerEntry[] = [
    { type: 'OPENING_BALANCE', amount: 10000n },
    { type: 'INCOME', amount: 5000n },
    { type: 'EXPENSE', amount: -700n },
    { type: 'ADJUSTMENT', amount: -300n },
    { type: 'REVERSAL', amount: -5000n }, // إلغاء دفعة
  ];

  it('الرصيد = مجموع كل القيود الموقّعة', () => {
    expect(computeBalance(ledger)).toBe(9000n);
    expect(computeBalance([])).toBe(0n);
  });

  it('سلسلة balanceAfter قيدًا بعد قيد', () => {
    let balance = 0n;
    balance = computeBalanceAfter(balance, 'OPENING_BALANCE', 10000n);
    expect(balance).toBe(10000n);
    balance = computeBalanceAfter(balance, 'INCOME', 5000n);
    expect(balance).toBe(15000n);
    balance = computeBalanceAfter(balance, 'EXPENSE', 700n);
    expect(balance).toBe(14300n);
    balance = computeBalanceAfter(balance, 'ADJUSTMENT', -300n);
    expect(balance).toBe(14000n);
    balance = computeBalanceAfter(balance, 'REVERSAL', -5000n);
    expect(balance).toBe(9000n);
  });

  it('الرصيد قد يصبح سالبًا نظريًا — لا يُصفَّر (الشفافية المالية)', () => {
    let balance = computeBalanceAfter(0n, 'OPENING_BALANCE', 1000n);
    balance = computeBalanceAfter(balance, 'EXPENSE', 1500n);
    expect(balance).toBe(-500n);
  });
});

describe('الإغلاق اليومي', () => {
  it('الفرق = المعدود − المتوقع (موجب فائض، سالب عجز)', () => {
    expect(closingDifference(14000n, 14000n)).toBe(0n);
    expect(closingDifference(14000n, 14500n)).toBe(500n);
    expect(closingDifference(14000n, 13000n)).toBe(-1000n);
  });
});
