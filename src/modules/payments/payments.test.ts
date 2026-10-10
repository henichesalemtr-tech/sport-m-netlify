import { describe, expect, it } from 'vitest';
import {
  computePaymentNet,
  evaluatePayment,
  isValidRefund,
  nextTransactionNo,
  paidAfterNewPayment,
  paidAfterVoid,
} from './logic';

describe('صافي الدفعة (BigInt بأصغر وحدة)', () => {
  it('بلا خصم → الصافي = المبلغ', () => {
    expect(computePaymentNet(3000n, 0n)).toEqual({ discountAmount: 0n, net: 3000n });
  });

  it('خصم على الدفعة → الصافي = المبلغ − الخصم', () => {
    expect(computePaymentNet(3000n, 500n)).toEqual({ discountAmount: 500n, net: 2500n });
  });

  it('خصم يتجاوز المبلغ → يُثبَّت عند المبلغ ولا يصبح الصافي سالبًا', () => {
    expect(computePaymentNet(3000n, 5000n)).toEqual({ discountAmount: 3000n, net: 0n });
  });
});

describe('المتبقي ورفض الدفع الزائد (7.11)', () => {
  const base = { subscriptionNet: 5000n, paidNonVoided: 0n, paymentNet: 2000n, allowOverpay: false };

  it('المتبقي = الصافي − مجموع غير الملغى', () => {
    const r = evaluatePayment(base);
    expect(r.remainingBefore).toBe(5000n);
    expect(r.remainingAfter).toBe(3000n);
    expect(r.isOverpay).toBe(false);
    expect(r.allowed).toBe(true);
  });

  it('دفعات متتالية تجمع المتبقي بشكل صحيح', () => {
    const step1 = evaluatePayment(base);
    const step2 = evaluatePayment({ ...base, paidNonVoided: paidAfterNewPayment(0n, 2000n), paymentNet: 2000n });
    expect(step1.remainingAfter).toBe(3000n);
    expect(step2.remainingAfter).toBe(1000n);
  });

  it('دفعة تساوي المتبقي بالضبط → مسموحة والمتبقي صفر', () => {
    const r = evaluatePayment({ ...base, paidNonVoided: 3000n, paymentNet: 2000n });
    expect(r.allowed).toBe(true);
    expect(r.remainingAfter).toBe(0n);
  });

  it('دفع زائد وallowOverpay=false → مرفوض (OVERPAYMENT)', () => {
    const r = evaluatePayment({ ...base, paymentNet: 5001n });
    expect(r.isOverpay).toBe(true);
    expect(r.allowed).toBe(false);
  });

  it('دفع زائد وallowOverpay=true → مسموح ومتبقي سالب', () => {
    const r = evaluatePayment({ ...base, paymentNet: 6000n, allowOverpay: true });
    expect(r.isOverpay).toBe(true);
    expect(r.allowed).toBe(true);
    expect(r.remainingAfter).toBe(-1000n);
  });

  it('إلغاء دفعة يعيد اشتقاق المدفوع (مصدر الحقيقة الدفعات)', () => {
    expect(paidAfterNewPayment(2000n, 1500n)).toBe(3500n);
    expect(paidAfterVoid(3500n, 1500n)).toBe(2000n);
  });
});

describe('رقم الحركة التسلسلي', () => {
  it('PAY-<السنة المالية>-<تسلسل 6 خانات>', () => {
    expect(nextTransactionNo(2026, 1)).toBe('PAY-2026-000001');
    expect(nextTransactionNo(2026, 4523)).toBe('PAY-2026-004523');
  });
});

describe('تحقق الاسترداد', () => {
  it('استرداد موجب ضمن المتاح → صالح', () => {
    expect(isValidRefund(5000n, 0n, 5000n)).toBe(true);
    expect(isValidRefund(5000n, 2000n, 3000n)).toBe(true);
  });

  it('استرداد يتجاوز المتاح أو ≤ صفر → مرفوض', () => {
    expect(isValidRefund(5000n, 2000n, 3001n)).toBe(false);
    expect(isValidRefund(5000n, 0n, 0n)).toBe(false);
    expect(isValidRefund(5000n, 0n, -100n)).toBe(false);
  });
});
