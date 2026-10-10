import { describe, expect, it } from 'vitest';
import { AGING_LABELS, agingSummary, classifyAging } from './aging';

describe('تصنيف أعمار الديون (7.14)', () => {
  it('لم يستحق بعد (سالب) ⇒ CURRENT', () => {
    expect(classifyAging(-5)).toBe('CURRENT');
    expect(classifyAging(-1)).toBe('CURRENT');
  });

  it('صفر يوم ⇒ CURRENT', () => {
    expect(classifyAging(0)).toBe('CURRENT');
  });

  it('حدود شريحة 0-30', () => {
    expect(classifyAging(1)).toBe('0-30');
    expect(classifyAging(30)).toBe('0-30');
  });

  it('حدود شريحة 31-60', () => {
    expect(classifyAging(31)).toBe('31-60');
    expect(classifyAging(60)).toBe('31-60');
  });

  it('أكثر من 60 يومًا ⇒ 60+', () => {
    expect(classifyAging(61)).toBe('60+');
    expect(classifyAging(365)).toBe('60+');
  });

  it('قيم غير منتهية ⇒ CURRENT (حماية من NaN)', () => {
    expect(classifyAging(Number.NaN)).toBe('CURRENT');
    expect(classifyAging(Number.POSITIVE_INFINITY)).toBe('CURRENT');
  });

  it('لكل شريحة تسمية عربية', () => {
    expect(AGING_LABELS['CURRENT']).toBe('غير مستحق');
    expect(AGING_LABELS['60+']).toBe('أكثر من 60 يومًا');
  });
});

describe('تجميع ملخص الأعمار (BigInt minor units)', () => {
  it('يجمع المبالغ لكل شريحة ويبدأ بأصفار', () => {
    const summary = agingSummary([
      { daysOverdue: -3, amountMinor: 1000n },
      { daysOverdue: 10, amountMinor: 2500n },
      { daysOverdue: 30, amountMinor: 500n },
      { daysOverdue: 45, amountMinor: 3000n },
      { daysOverdue: 120, amountMinor: 7000n },
    ]);
    expect(summary).toEqual({
      CURRENT: 1000n,
      '0-30': 3000n,
      '31-60': 3000n,
      '60+': 7000n,
    });
  });

  it('قائمة فارغة ⇒ كل الشرائح صفر', () => {
    expect(agingSummary([])).toEqual({ CURRENT: 0n, '0-30': 0n, '31-60': 0n, '60+': 0n });
  });
});
