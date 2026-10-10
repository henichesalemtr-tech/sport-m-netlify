import { describe, expect, it } from 'vitest';
import { parseDateOnly, addDays } from '@/shared/dates';
import {
  canTransition,
  computeRenewalStart,
  computeSubscriptionNet,
  deriveEndDate,
  fixedDiscountExceedsPrice,
  isEffectivelyExpired,
  periodLengthDays,
} from './logic';

describe('حساب الخصم على الاشتراك (BigInt بأصغر وحدة)', () => {
  it('خصم ثابت: الصافي = السعر − الخصم', () => {
    const r = computeSubscriptionNet(5000n, { kind: 'FIXED', value: 500n });
    expect(r.discountAmount).toBe(500n);
    expect(r.net).toBe(4500n);
  });

  it('خصم ثابت يتجاوز السعر → مرفوض قبل التخزين', () => {
    expect(fixedDiscountExceedsPrice(5000n, 5500n)).toBe(true);
    expect(fixedDiscountExceedsPrice(5000n, 5000n)).toBe(false);
  });

  it('نسبة خصم: القيمة مخزنة ×100 (1250 = 12.5%)', () => {
    const r = computeSubscriptionNet(10000n, { kind: 'PERCENT', value: 1250n });
    expect(r.discountAmount).toBe(1250n);
    expect(r.net).toBe(8750n);
  });

  it('تقريب النسبة لأسفل لأصغر وحدة (الخيار الأكثر أمانًا ماليًا)', () => {
    // 999 × 12.5% = 124.875 → 124 (أسفل)
    const r = computeSubscriptionNet(999n, { kind: 'PERCENT', value: 1250n });
    expect(r.discountAmount).toBe(124n);
    expect(r.net).toBe(875n);
  });

  it('نسبة 100% → الصافي صفر ولا يصبح سالبًا', () => {
    const r = computeSubscriptionNet(3000n, { kind: 'PERCENT', value: 10000n });
    expect(r.discountAmount).toBe(3000n);
    expect(r.net).toBe(0n);
  });

  it('بلا خصم → الصافي = السعر', () => {
    expect(computeSubscriptionNet(7777n, null).net).toBe(7777n);
  });
});

describe('انتقالات حالة الاشتراك (7.10)', () => {
  it('ACTIVE → EXPIRED / SUSPENDED / RENEWING / CANCELLED', () => {
    expect(canTransition('ACTIVE', 'EXPIRED')).toBe(true);
    expect(canTransition('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransition('ACTIVE', 'RENEWING')).toBe(true);
    expect(canTransition('ACTIVE', 'CANCELLED')).toBe(true);
  });

  it('ACTIVE ↔ SUSPENDED', () => {
    expect(canTransition('SUSPENDED', 'ACTIVE')).toBe(true);
  });

  it('EXPIRED → RENEWING مسموح، EXPIRED → ACTIVE ممنوع', () => {
    expect(canTransition('EXPIRED', 'RENEWING')).toBe(true);
    expect(canTransition('EXPIRED', 'ACTIVE')).toBe(false);
  });

  it('أي حالة → CANCELLED (عدا الملغاة)', () => {
    expect(canTransition('SUSPENDED', 'CANCELLED')).toBe(true);
    expect(canTransition('RENEWING', 'CANCELLED')).toBe(true);
    expect(canTransition('EXPIRED', 'CANCELLED')).toBe(true);
    expect(canTransition('CANCELLED', 'CANCELLED')).toBe(false);
  });

  it('CANCELLED حالة نهائية', () => {
    expect(canTransition('CANCELLED', 'ACTIVE')).toBe(false);
    expect(canTransition('CANCELLED', 'RENEWING')).toBe(false);
  });

  it('الانتهاء الفعلي: ACTIVE وتجاوزت endDate', () => {
    const today = parseDateOnly('2026-10-09');
    expect(isEffectivelyExpired('ACTIVE', parseDateOnly('2026-10-08'), today)).toBe(true);
    expect(isEffectivelyExpired('ACTIVE', parseDateOnly('2026-10-09'), today)).toBe(false);
    expect(isEffectivelyExpired('SUSPENDED', parseDateOnly('2026-10-08'), today)).toBe(false);
  });
});

describe('تواريخ الاشتراك والتجديد (7.9)', () => {
  it('النهاية = البداية + المدة − يوم (يوم البداية يُحتسب)', () => {
    expect(deriveEndDate(parseDateOnly('2026-01-01'), 30)).toEqual(parseDateOnly('2026-01-30'));
    expect(deriveEndDate(parseDateOnly('2026-01-01'), 365)).toEqual(parseDateOnly('2026-12-31'));
    expect(deriveEndDate(parseDateOnly('2026-01-01'), 1)).toEqual(parseDateOnly('2026-01-01'));
  });

  it('طول الفترة السابقة (بالأيام، شاملاً الطرفين)', () => {
    expect(periodLengthDays(parseDateOnly('2026-01-01'), parseDateOnly('2026-01-30'))).toBe(30);
  });

  it('تجديد اشتراك غير منتهٍ → اليوم التالي للنهاية', () => {
    const start = computeRenewalStart({
      previousEnd: parseDateOnly('2026-12-31'),
      today: parseDateOnly('2026-12-01'),
      startFromTodayWhenExpired: true,
    });
    expect(start).toEqual(parseDateOnly('2027-01-01'));
  });

  it('تجديد اشتراك منتهٍ مع إعداد "البدء من اليوم" → اليوم', () => {
    const start = computeRenewalStart({
      previousEnd: parseDateOnly('2026-09-30'),
      today: parseDateOnly('2026-10-09'),
      startFromTodayWhenExpired: true,
    });
    expect(start).toEqual(parseDateOnly('2026-10-09'));
  });

  it('تجديد اشتراك منتهٍ مع تعطيل الإعداد → اليوم التالي للنهاية القديمة', () => {
    const start = computeRenewalStart({
      previousEnd: parseDateOnly('2026-09-30'),
      today: parseDateOnly('2026-10-09'),
      startFromTodayWhenExpired: false,
    });
    expect(start).toEqual(parseDateOnly('2026-10-01'));
  });

  it('النهاية تنتهي في اليوم التالي للبداية عند عبور نهاية الشهر/السنة', () => {
    expect(addDays(parseDateOnly('2026-02-28'), 1)).toEqual(parseDateOnly('2026-03-01'));
    expect(addDays(parseDateOnly('2026-12-31'), 1)).toEqual(parseDateOnly('2027-01-01'));
  });
});
