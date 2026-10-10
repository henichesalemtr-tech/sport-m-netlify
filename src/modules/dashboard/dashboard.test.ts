import { describe, expect, it } from 'vitest';
import {
  aggregateSeries,
  attendanceRate,
  netIncome,
  percentage,
  seriesBucketKey,
  subscriptionBucket,
} from './metrics';

describe('نسبة الحضور (8.1)', () => {
  it('(حاضر + متأخر) / (حاضر + متأخر + غائب) × 100', () => {
    expect(attendanceRate({ present: 8, late: 2, absent: 0, excused: 0 })).toBe(100);
    expect(attendanceRate({ present: 5, late: 0, absent: 5, excused: 0 })).toBe(50);
  });

  it('الغياب بعذر مستثنى من المقام', () => {
    expect(attendanceRate({ present: 3, late: 0, absent: 1, excused: 10 })).toBe(75);
  });

  it('لا سجلات ⇒ null (لا نسبة ملفقة)', () => {
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 5 })).toBeNull();
  });

  it('تقريب منزلة عشرية واحدة', () => {
    expect(attendanceRate({ present: 1, late: 0, absent: 2, excused: 0 })).toBe(33.3);
  });
});

describe('صافي الدخل (BigInt minor units)', () => {
  it('الإيراد − المصروف', () => {
    expect(netIncome(100_000n, 40_000n)).toBe(60_000n);
  });

  it('قد يكون سالبًا (خسارة)', () => {
    expect(netIncome(10n, 25n)).toBe(-15n);
  });
});

describe('تصنيف الاشتراكات للوحة القيادة', () => {
  const today = new Date('2026-03-01T00:00:00Z');

  it('ACTIVE وينتهي بعد الأفق ⇒ ACTIVE', () => {
    expect(subscriptionBucket('ACTIVE', new Date('2026-06-01T00:00:00Z'), today, 7)).toBe('ACTIVE');
  });

  it('ACTIVE وينتهي خلال expiringDays ⇒ EXPIRING', () => {
    expect(subscriptionBucket('ACTIVE', new Date('2026-03-05T00:00:00Z'), today, 7)).toBe('EXPIRING');
  });

  it('ACTIVE وتاريخه قبل اليوم ⇒ EXPIRED', () => {
    expect(subscriptionBucket('ACTIVE', new Date('2026-02-28T00:00:00Z'), today, 7)).toBe('EXPIRED');
  });

  it('حالة EXPIRED صريحة ⇒ EXPIRED', () => {
    expect(subscriptionBucket('EXPIRED', new Date('2026-06-01T00:00:00Z'), today, 7)).toBe('EXPIRED');
  });

  it('حالات أخرى (SUSPENDED/CANCELLED) ⇒ OTHER', () => {
    expect(subscriptionBucket('SUSPENDED', new Date('2026-06-01T00:00:00Z'), today, 7)).toBe('OTHER');
    expect(subscriptionBucket('CANCELLED', new Date('2026-06-01T00:00:00Z'), today, 7)).toBe('OTHER');
  });
});

describe('مفاتيح وتجميع السلاسل الزمنية', () => {
  it('seriesBucketKey لكل حبيبية', () => {
    const d = new Date('2026-03-15T12:00:00Z');
    expect(seriesBucketKey(d, 'day')).toBe('2026-03-15');
    expect(seriesBucketKey(d, 'month')).toBe('2026-03');
    expect(seriesBucketKey(d, 'year')).toBe('2026');
    expect(seriesBucketKey(d, 'week')).toMatch(/^W\d+$/);
  });

  it('aggregateSeries شهريًا: يملأ الفجوات بأصفار ويجمع', () => {
    const result = aggregateSeries(
      [
        { date: new Date('2026-01-05T00:00:00Z'), amountMinor: 100n },
        { date: new Date('2026-01-20T00:00:00Z'), amountMinor: 50n },
        { date: new Date('2026-03-10T00:00:00Z'), amountMinor: 70n },
      ],
      'month',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-03-31T00:00:00Z'),
    );
    expect(result).toEqual([
      { key: '2026-01', total: 150n },
      { key: '2026-02', total: 0n },
      { key: '2026-03', total: 70n },
    ]);
  });

  it('aggregateSeries يوميًا: يملأ الأيام الناقصة', () => {
    const result = aggregateSeries(
      [{ date: new Date('2026-01-03T00:00:00Z'), amountMinor: 9n }],
      'day',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-03T00:00:00Z'),
    );
    expect(result).toEqual([
      { key: '2026-01-01', total: 0n },
      { key: '2026-01-02', total: 0n },
      { key: '2026-01-03', total: 9n },
    ]);
  });

  it('نطاق فارغ ⇒ مصفوفة فارغة', () => {
    expect(
      aggregateSeries([], 'day', new Date('2026-01-02T00:00:00Z'), new Date('2026-01-01T00:00:00Z')),
    ).toEqual([]);
  });
});

describe('نسبة مئوية آمنة', () => {
  it('تحسب وتقرّب منزلة واحدة', () => {
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(1, 2)).toBe(50);
  });

  it('مقام صفري ⇒ 0 (لا NaN)', () => {
    expect(percentage(5, 0)).toBe(0);
  });
});
