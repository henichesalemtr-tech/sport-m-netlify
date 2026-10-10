import { describe, expect, it } from 'vitest';
import {
  extractSequence,
  formatHasSequence,
  generateRegistrationNumber,
  isValidRegistrationFormat,
  nextSequence,
  registrationNumberPattern,
} from './registrationNumber';
import {
  detectAthleteDuplicates,
  fullNameKey,
  normalizePhone,
  type DuplicateCandidate,
} from './duplicates';

describe('توليد رقم التسجيل', () => {
  const ctx = { year: 2026, month: 9, sequence: 7 };

  it('يولد الرقم بالصيغة الافتراضية ATH-{YYYY}-{SEQ:5}', () => {
    expect(generateRegistrationNumber('ATH-{YYYY}-{SEQ:5}', ctx)).toBe('ATH-2026-00007');
  });

  it('يدعم الرموز YY/MM/SPORT وعرض تسلسل مخصص', () => {
    expect(generateRegistrationNumber('{YY}{MM}-{SEQ:3}', ctx)).toBe('2609-007');
    expect(
      generateRegistrationNumber('{SPORT}-{YYYY}-{SEQ:4}', { ...ctx, sportCode: 'KAR' }),
    ).toBe('KAR-2026-0007');
  });

  it('يتحقق من صحة الصيغة ويرفض المجهول', () => {
    expect(isValidRegistrationFormat('ATH-{YYYY}-{SEQ:5}')).toBe(true);
    expect(isValidRegistrationFormat('ATH-2026')).toBe(false); // بلا رموز
    expect(isValidRegistrationFormat('ATH-{UNKNOWN}-1')).toBe(false);
    expect(isValidRegistrationFormat('')).toBe(false);
    expect(() => generateRegistrationNumber('ATH-{UNKNOWN}', ctx)).toThrow();
  });

  it('يرفض سياقًا غير صالح', () => {
    expect(() => generateRegistrationNumber('ATH-{SEQ:5}', { ...ctx, sequence: 0 })).toThrow();
    expect(() => generateRegistrationNumber('ATH-{SEQ:5}', { ...ctx, month: 13 })).toThrow();
    expect(() => generateRegistrationNumber('ATH-{SEQ:5}', { ...ctx, year: 1800 })).toThrow();
  });

  it('يستخرج التسلسل من الأرقام الموجودة ويحسب التالي', () => {
    const format = 'ATH-{YYYY}-{SEQ:5}';
    expect(extractSequence('ATH-2026-00042', format)).toBe(42);
    expect(extractSequence('NOT-MATCHING', format)).toBeNull();
    expect(nextSequence(['ATH-2026-00003', 'ATH-2025-00010', 'BAD'], format)).toBe(11);
    expect(nextSequence([], format)).toBe(1);
    expect(formatHasSequence('ATH-{YYYY}')).toBe(false);
    expect(nextSequence(['ATH-2026'], 'ATH-{YYYY}')).toBe(1);
  });

  it('يبني نمط Regex مطابقًا للصيغة', () => {
    const re = registrationNumberPattern('ATH-{YYYY}-{SEQ:5}');
    expect(re.test('ATH-2026-00007')).toBe(true);
    expect(re.test('ATH-26-00007')).toBe(false);
    expect(re.test('XATH-2026-00007')).toBe(false);
  });
});

describe('تطبيع الهاتف', () => {
  it('يوحد الصيغ المحلية والدولية (الجزائر)', () => {
    expect(normalizePhone('0555 12 34 56')).toBe('0555123456');
    expect(normalizePhone('+213 555 12 34 56')).toBe('0555123456');
    expect(normalizePhone('00213555123456')).toBe('0555123456');
    expect(normalizePhone('213555123456')).toBe('0555123456');
  });
});

describe('كشف الرياضيين المكررين', () => {
  const candidate = (over: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
    id: 'a1',
    registrationNo: 'ATH-2026-00001',
    firstName: 'أحمد',
    lastName: 'بن علي',
    birthDate: '2010-05-14',
    phone: null,
    parentPhones: ['0555123456'],
    ...over,
  });

  it('يطابق الاسم مع تاريخ الميلاد رغم اختلاف الألف/التشكيل', () => {
    const matches = detectAthleteDuplicates(
      { firstName: 'احمد', lastName: 'بن عليّ', birthDate: '2010-05-14' },
      [candidate()],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toContain('NAME_BIRTHDATE');
  });

  it('يطابق الاسم مع هاتف ولي بصيغة دولية مختلفة', () => {
    const matches = detectAthleteDuplicates(
      { firstName: 'أحمد', lastName: 'بن علي', parentPhones: ['+213555123456'] },
      [candidate({ birthDate: '2011-01-01' })],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toEqual(['NAME_PARENT_PHONE']);
  });

  it('لا يعتبر تطابق الاسم وحده تكرارًا', () => {
    const matches = detectAthleteDuplicates(
      { firstName: 'أحمد', lastName: 'بن علي' },
      [candidate({ birthDate: '2011-01-01', parentPhones: ['0666000000'] })],
    );
    expect(matches).toHaveLength(0);
  });

  it('لا يطابق اسم عائلة مختلف (التاء المربوطة/الاسم الأول متطابق)', () => {
    expect(fullNameKey('فاطمة', 'الزهراء')).toBe(fullNameKey('فاطمه', 'الزهراء'));
    const matches = detectAthleteDuplicates(
      { firstName: 'فاطمة', lastName: 'الزهراء', birthDate: '2012-02-02' },
      [candidate({ firstName: 'فاطمة', lastName: 'بوزيد', birthDate: '2012-02-02' })],
    );
    expect(matches).toHaveLength(0);
  });

  it('يجمع عدة أسباب ويرتب حسب القوة', () => {
    const matches = detectAthleteDuplicates(
      {
        firstName: 'أحمد',
        lastName: 'بن علي',
        birthDate: '2010-05-14',
        phone: '0555123456',
        parentPhones: ['0555123456'],
      },
      [
        candidate({ id: 'weak', birthDate: '2011-01-01', parentPhones: [] }),
        candidate({ id: 'strong', phone: '0555123456' }),
      ],
    );
    expect(matches[0]?.athleteId).toBe('strong');
    expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 0);
    expect(matches[0]?.reasons).toEqual(['NAME_BIRTHDATE', 'NAME_PARENT_PHONE', 'NAME_PHONE']);
  });
});
