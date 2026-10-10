import { describe, expect, it } from 'vitest';
import { computeChildDebt, computeParentDebts } from './debts';
import { detectDuplicateParents } from './duplicates';

describe('حساب ديون الأبناء (BigInt بأصغر وحدة)', () => {
  it('المتبقي = الصافي − المدفوع غير الملغى', () => {
    const result = computeChildDebt({
      athleteId: 'ath1',
      subscriptions: [
        { id: 's1', netAmount: 5000n },
        { id: 's2', netAmount: 3000n },
      ],
      paidBySubscription: { s1: 3000n },
    });
    expect(result.perSubscription[0]?.remaining).toBe(2000n);
    expect(result.perSubscription[1]?.remaining).toBe(3000n);
    expect(result.totalNet).toBe(8000n);
    expect(result.totalPaid).toBe(3000n);
    expect(result.totalDebt).toBe(5000n);
  });

  it('الدفع الزائد يظهر كمتبقي سالب (لا يُصفّر — القرار لطبقة المدفوعات)', () => {
    const result = computeChildDebt({
      athleteId: 'ath1',
      subscriptions: [{ id: 's1', netAmount: 5000n }],
      paidBySubscription: { s1: 6000n },
    });
    expect(result.totalDebt).toBe(-1000n);
  });

  it('بلا اشتراكات → أصفار BigInt', () => {
    const result = computeChildDebt({ athleteId: 'ath1', subscriptions: [], paidBySubscription: {} });
    expect(result.totalDebt).toBe(0n);
    expect(result.totalNet).toBe(0n);
    expect(result.totalPaid).toBe(0n);
  });

  it('يجمع ديون الولي عبر كل أبنائه', () => {
    const result = computeParentDebts([
      {
        athleteId: 'ath1',
        subscriptions: [{ id: 's1', netAmount: 5000n }],
        paidBySubscription: { s1: 2000n },
      },
      {
        athleteId: 'ath2',
        subscriptions: [
          { id: 's2', netAmount: 4000n },
          { id: 's3', netAmount: 1500n },
        ],
        paidBySubscription: { s3: 1500n },
      },
    ]);
    expect(result.perChild).toHaveLength(2);
    expect(result.perChild[0]?.totalDebt).toBe(3000n);
    expect(result.perChild[1]?.totalDebt).toBe(4000n);
    expect(result.totalDebt).toBe(7000n);
    expect(result.totalNet).toBe(10500n);
    expect(result.totalPaid).toBe(3500n);
  });
});

describe('كشف الأولياء المكررين بالهاتف', () => {
  const candidates = [
    { id: 'p1', firstName: 'محمد', lastName: 'كريم', phone: '0555123456', phone2: null },
    { id: 'p2', firstName: 'سعيد', lastName: 'آخر', phone: '0666111222', phone2: '0770000000' },
  ];

  it('يطابق الهاتف نفسه بصيغ مختلفة', () => {
    const matches = detectDuplicateParents({ phone: '+213555123456' }, candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.parentId).toBe('p1');
    expect(matches[0]?.reasons).toEqual(['PHONE']);
  });

  it('يطابق الهاتف الوارد مع الهاتف الثانوي (بالاتجاهين)', () => {
    const matches = detectDuplicateParents({ phone: '0770 000 000' }, candidates);
    expect(matches[0]?.reasons).toContain('PHONE_MATCHES_PHONE2');
    const cross = detectDuplicateParents({ phone: '0666111222', phone2: '0770000000' }, candidates);
    expect(cross[0]?.reasons).toContain('PHONE2');
    expect(cross[0]?.score).toBeGreaterThanOrEqual(2);
  });

  it('لا تكرار عند اختلاف الأرقام', () => {
    expect(detectDuplicateParents({ phone: '0555000000' }, candidates)).toHaveLength(0);
  });

  it('يتجاهل الأرقام القصيرة/غير الصالحة', () => {
    expect(detectDuplicateParents({ phone: '12345' }, candidates)).toHaveLength(0);
  });
});
