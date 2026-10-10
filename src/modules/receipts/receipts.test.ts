import { describe, expect, it } from 'vitest';
import {
  findSequenceGaps,
  formatReceiptNo,
  isGapless,
  nextReceiptSequence,
} from './logic';

describe('تسلسل أرقام الوصولات بلا فجوات (7.11)', () => {
  it('أول وصل في السنة المالية → 1', () => {
    expect(nextReceiptSequence([])).toBe(1);
  });

  it('التالي = أكبر رقم + 1', () => {
    expect(nextReceiptSequence([1, 2, 3])).toBe(4);
    expect(nextReceiptSequence([3, 1, 2])).toBe(4); // الترتيب لا يهم
  });

  it('سلسلة كاملة 1..n بلا فجوات', () => {
    expect(isGapless([1, 2, 3, 4, 5])).toBe(true);
    expect(isGapless([])).toBe(true);
  });

  it('كشف الفجوات (وصل محذوف/مفقود = انتهاك يُرصد)', () => {
    expect(isGapless([1, 2, 4])).toBe(false);
    expect(findSequenceGaps([1, 2, 4, 7])).toEqual([3, 5, 6]);
    expect(findSequenceGaps([1, 2, 3])).toEqual([]);
  });

  it('التكرار انتهاك (القيد الفريد fiscalYear+sequence يمنع حدوثه)', () => {
    expect(isGapless([1, 2, 2, 3])).toBe(false);
  });

  it('الإلغاء (VOID) لا يزيل الرقم من السلسلة — بلا فجوات', () => {
    // الوصل الملغى يبقى في الجدول؛ الأرقام الموجودة كما هي
    const sequences = [1, 2, 3];
    expect(isGapless(sequences)).toBe(true);
    expect(nextReceiptSequence(sequences)).toBe(4);
  });

  it('صيغة رقم الوصل: REC-<السنة>-<تسلسل 6 خانات>', () => {
    expect(formatReceiptNo(2026, 1)).toBe('REC-2026-000001');
    expect(formatReceiptNo(2026, 98765)).toBe('REC-2026-098765');
  });

  it('محاكاة إصدار متسلسل: كل رقم يُستخدم مرة واحدة وبلا فجوات', () => {
    const issued: number[] = [];
    for (let i = 0; i < 50; i++) {
      issued.push(nextReceiptSequence(issued));
    }
    expect(issued[0]).toBe(1);
    expect(issued[49]).toBe(50);
    expect(isGapless(issued)).toBe(true);
  });
});
