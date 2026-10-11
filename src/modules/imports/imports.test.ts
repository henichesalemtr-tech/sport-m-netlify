import { describe, expect, it } from 'vitest';
import { ATHLETE_ENTITY, athleteIdentity, normalizeGender, validateAthleteRow } from './entities';

/** صف صالح مرجعي — تُعدَّل منه الحقول المدروسة. */
function row(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    firstName: 'محمد',
    lastName: 'بن علي',
    birthDate: '2010-05-14',
    gender: 'ذكر',
    phone: '',
    email: '',
    address: '',
    registrationNo: '',
    sport: '',
    emergencyName: '',
    emergencyPhone: '',
    notes: '',
    ...overrides,
  };
}

describe('التحقق من صفوف استيراد الرياضيين', () => {
  it('يقبل الصف الصالح ويطبّع الجنس', () => {
    const result = validateAthleteRow(row());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.gender).toBe('MALE');
      expect(result.value.birthDate).toBe('2010-05-14');
    }
  });

  it('يحوّل الخلايا الفارغة إلى قيم غير موجودة (لا نص فارغ)', () => {
    const result = validateAthleteRow(row());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // الفراغ يجب أن يصبح undefined: النص الفارغ كان يُدرج كرقم تسجيل فارغ
      // فيصطدم بالقيد الفريد عند استيراد أكثر من صف.
      expect(result.value.registrationNo).toBeUndefined();
      expect(result.value.phone).toBeUndefined();
      expect(result.value.email).toBeUndefined();
      expect(result.value.sport).toBeUndefined();
      expect(result.value.emergencyPhone).toBeUndefined();
    }
  });

  it('يبقي القيم المدخلة بعد إزالة المسافات الزائدة', () => {
    const result = validateAthleteRow(row({ registrationNo: ' ATH-2026-00020 ', phone: ' 0555123456 ' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.registrationNo).toBe('ATH-2026-00020');
      expect(result.value.phone).toBe('0555123456');
    }
  });

  it('يرفض تاريخًا بصيغة DD/MM/YYYY مع رسائل واضحة', () => {
    const result = validateAthleteRow(row({ birthDate: '31/12/2011' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.field)).toContain('birthDate');
    }
  });

  it('يرفض الاسم القصير والجنس غير المعروف', () => {
    const shortName = validateAthleteRow(row({ firstName: 'ب' }));
    expect(shortName.ok).toBe(false);
    const badGender = validateAthleteRow(row({ gender: 'آخر' }));
    expect(badGender.ok).toBe(false);
  });

  it('يطبّع أسماء الجنس العربية واللاتينية', () => {
    expect(normalizeGender('ذكر')).toBe('MALE');
    expect(normalizeGender(' أنثى ')).toBe('FEMALE');
    expect(normalizeGender('Female')).toBe('FEMALE');
    expect(normalizeGender('M')).toBe('MALE');
  });

  it('يبني هوية التكرار من الاسم الكامل وتاريخ الميلاد (بغير حساسية للحالة والمسافات)', () => {
    const a = athleteIdentity({ firstName: 'فادي', lastName: 'العربي', birthDate: '2012-03-11', gender: 'MALE' });
    const b = athleteIdentity({ firstName: ' فادي ', lastName: 'العربي', birthDate: '2012-03-11', gender: 'FEMALE' });
    expect(a).toBe(b);
  });

  it('تعرّف الكيان يعطي مفاتيح تكرار null للقيم غير الموجودة', () => {
    const result = validateAthleteRow(row());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(ATHLETE_ENTITY.duplicateKeys(result.value)).toEqual({
        phone: null,
        email: null,
        identity: 'محمد|بن علي|2010-05-14',
      });
    }
  });

  it('قالب التنزيل يحوي كل الحقول القابلة للربط', () => {
    expect(ATHLETE_ENTITY.templateHeaders).toHaveLength(ATHLETE_ENTITY.fields.length);
    expect(ATHLETE_ENTITY.templateExample).toHaveLength(ATHLETE_ENTITY.fields.length);
  });
});
