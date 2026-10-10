import { describe, expect, it } from 'vitest';
import {
  CSV_BOM,
  buildCsv,
  contentDisposition,
  escapeCsvField,
  rowToCsvLine,
  sanitizeCsvCell,
  toCsvLine,
} from './csv';

describe('تعقيم حقن الصيغ (CSV Injection)', () => {
  it('خلية تبدأ بـ = تُسبق بـ علامة اقتباس', () => {
    expect(sanitizeCsvCell('=CMD()')).toBe("'=CMD()");
  });

  it('كل بادئات الحقن (+ - @) تُحيَّد', () => {
    expect(sanitizeCsvCell('+1234')).toBe("'+1234");
    expect(sanitizeCsvCell('-2+3')).toBe("'-2+3");
    expect(sanitizeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('القيم العادية لا تتغير', () => {
    expect(sanitizeCsvCell('اسم اللاعب')).toBe('اسم اللاعب');
    expect(sanitizeCsvCell(1500)).toBe('1500');
    expect(sanitizeCsvCell(true)).toBe('true');
    expect(sanitizeCsvCell(2500n)).toBe('2500');
  });

  it('null/undefined → نص فارغ', () => {
    expect(sanitizeCsvCell(null)).toBe('');
    expect(sanitizeCsvCell(undefined)).toBe('');
  });

  it('تُزال المحارف الاتجاهية غير المرئية', () => {
    expect(sanitizeCsvCell('abc\u202Edef\u200B')).toBe('abcdef');
  });

  it('التاريخ يتحول إلى ISO', () => {
    expect(sanitizeCsvCell(new Date('2026-01-15T10:00:00Z'))).toBe('2026-01-15T10:00:00.000Z');
  });
});

describe('اقتباس حقول CSV', () => {
  it('حقل عادي بلا اقتباس', () => {
    expect(escapeCsvField('محمد')).toBe('محمد');
  });

  it('فاصلة أو اقتباس أو سطر جديد ⇒ اقتباس ومضاعفة علامات الاقتباس', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('بناء الأسطر والملف الكامل', () => {
  it('toCsvLine يعقّم ثم يقتبس', () => {
    expect(toCsvLine(['=X', 'a,b', 5])).toBe("'=X,\"a,b\",5");
  });

  it('rowToCsvLine يتبع ترتيب الأعمدة', () => {
    const columns = [
      { key: 'name', label: 'الاسم' },
      { key: 'amount', label: 'المبلغ' },
    ];
    expect(rowToCsvLine({ amount: 100, name: 'لاعب', extra: 'x' }, columns)).toBe('لاعب,100');
  });

  it('buildCsv يبدأ بـ BOM ويستخدم CRLF ويتضمن الترويسة', () => {
    const csv = buildCsv([{ key: 'n', label: 'الاسم' }], [{ n: 'لاعب' }]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toBe(`${CSV_BOM}الاسم\r\nلاعب\r\n`);
  });
});

describe('Content-Disposition', () => {
  it('افتراضي attachment مع نسخة ASCII آمنة وfilename* مشفّرة', () => {
    const header = contentDisposition('تقرير-الديون.csv');
    expect(header.startsWith('attachment;')).toBe(true);
    expect(header).toContain('filename*=UTF-8');
    expect(header).not.toContain('"تقرير');
  });

  it('inline عند الطلب (معاينة)', () => {
    expect(contentDisposition('doc.pdf', true).startsWith('inline;')).toBe(true);
  });
});
