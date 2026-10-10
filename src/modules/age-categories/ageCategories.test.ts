import { describe, expect, it } from 'vitest';
import {
  findGaps,
  findOverlaps,
  isSenior,
  seasonReferenceDate,
  suggestCategoryForAge,
  validateCategories,
  type CategoryRange,
} from './ageRules';

const cat = (id: string, name: string, minAge: number | null, maxAge: number | null): CategoryRange => ({
  id,
  name,
  minAge,
  maxAge,
});

describe('كشف تداخل الفئات العمرية', () => {
  it('لا يجد تداخلًا في سلسلة سليمة', () => {
    const list = [cat('1', 'أصاغر', 6, 9), cat('2', 'أواسط', 10, 13), cat('3', 'أكابر', 14, null)];
    expect(findOverlaps(list)).toHaveLength(0);
  });

  it('يكتشف تداخل الفئات العادية', () => {
    const list = [cat('1', 'أصاغر', 6, 10), cat('2', 'أواسط', 10, 13)];
    const overlaps = findOverlaps(list);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.firstId).toBe('1');
    expect(overlaps[0]?.secondId).toBe('2');
  });

  it('يكتشف تداخل فئة الأكابر المفتوحة مع فئة عادية', () => {
    const list = [cat('1', 'أواسط', 10, 15), cat('2', 'أكابر', 14, null)];
    expect(findOverlaps(list)).toHaveLength(1);
  });

  it('يعتبر فئتي أكابر متداخلتين دائمًا', () => {
    const list = [cat('1', 'أكابر أ', 14, null), cat('2', 'أكابر ب', 18, null)];
    expect(findOverlaps(list)).toHaveLength(1);
    expect(isSenior(list[0] as CategoryRange)).toBe(true);
  });
});

describe('كشف الفجوات بين الفئات العمرية', () => {
  it('لا يجد فجوات في سلسلة متصلة', () => {
    const list = [cat('1', 'أصاغر', 6, 9), cat('2', 'أواسط', 10, 13), cat('3', 'أكابر', 14, null)];
    expect(findGaps(list)).toHaveLength(0);
  });

  it('يكتشف فجوة بين فئتين عاديتين', () => {
    const list = [cat('1', 'أصاغر', 6, 9), cat('2', 'أواسط', 12, 15)];
    const gaps = findGaps(list);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.fromAge).toBe(10);
    expect(gaps[0]?.toAge).toBe(11);
  });

  it('يكتشف فجوة قبل فئة الأكابر', () => {
    const list = [cat('1', 'أواسط', 10, 13), cat('2', 'أكابر', 16, null)];
    const gaps = findGaps(list);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.fromAge).toBe(14);
    expect(gaps[0]?.toAge).toBe(15);
    expect(gaps[0]?.beforeCategoryName).toBe('أكابر');
  });

  it('validateCategories يجمع التداخلات والفجوات ويقرر الصلاحية', () => {
    const valid = validateCategories([cat('1', 'أصاغر', 6, 9), cat('2', 'أكابر', 10, null)]);
    expect(valid.valid).toBe(true);
    const invalid = validateCategories([cat('1', 'أصاغر', 6, 10), cat('2', 'أكابر', 14, null)]);
    expect(invalid.valid).toBe(false);
    expect(invalid.gaps).toHaveLength(1);
  });
});

describe('اقتراح الفئة حسب العمر', () => {
  const list = [cat('1', 'أصاغر', 6, 9), cat('2', 'أواسط', 10, 13), cat('3', 'أكابر', 14, null)];

  it('يختار الفئة المطابقة للعمر', () => {
    expect(suggestCategoryForAge(8, list)?.id).toBe('1');
    expect(suggestCategoryForAge(10, list)?.id).toBe('2');
    expect(suggestCategoryForAge(13, list)?.id).toBe('2');
    expect(suggestCategoryForAge(99, list)?.id).toBe('3');
  });

  it('يعيد null لعمر غير مغطى', () => {
    expect(suggestCategoryForAge(4, list)).toBeNull();
  });
});

describe('التاريخ المرجعي لبداية الموسم', () => {
  it('يعيد بداية الموسم الحالية إذا تجاوزناها', () => {
    const ref = seasonReferenceDate(new Date(Date.UTC(2026, 9, 15)), 9);
    expect(ref.toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it('يعيد بداية الموسم السابقة قبل موعده', () => {
    const ref = seasonReferenceDate(new Date(Date.UTC(2026, 5, 1)), 9);
    expect(ref.toISOString().slice(0, 10)).toBe('2025-09-01');
  });

  it('يضبط الأشهر غير الصالحة ضمن 1-12', () => {
    const ref = seasonReferenceDate(new Date(Date.UTC(2026, 0, 31)), 13);
    expect(ref.toISOString().slice(0, 10)).toBe('2025-12-01');
  });
});
