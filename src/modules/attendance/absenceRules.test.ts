import { describe, expect, it } from 'vitest';
import { lateMinutes } from '@/shared/dates';
import {
  consecutiveAbsences,
  isAttendedStatus,
  isOutsideEditWindow,
  resolveStatus,
  shouldAlertAbsence,
} from './absenceRules';

describe('دقائق التأخر (shared/dates)', () => {
  const start = new Date(Date.UTC(2026, 9, 10, 17, 0, 0));

  it('صفر عند الحضور قبل البداية أو عندها', () => {
    expect(lateMinutes(start, new Date(start.getTime() - 5 * 60_000))).toBe(0);
    expect(lateMinutes(start, start)).toBe(0);
  });

  it('يحسب الدقائق الكاملة بعد البداية', () => {
    expect(lateMinutes(start, new Date(start.getTime() + 7 * 60_000 + 30_000))).toBe(7);
    expect(lateMinutes(start, new Date(start.getTime() + 90 * 60_000))).toBe(90);
  });
});

describe('تحديد الحالة تلقائيًا (LATE)', () => {
  it('PRESENT ضمن حد التأخر وLATE بعده', () => {
    expect(resolveStatus(undefined, 0, 10)).toBe('PRESENT');
    expect(resolveStatus(undefined, 10, 10)).toBe('PRESENT'); // الحد نفسه ليس تأخرًا
    expect(resolveStatus(undefined, 11, 10)).toBe('LATE');
    expect(resolveStatus('PRESENT', 25, 10)).toBe('LATE'); // تصحيح تلقائي
  });

  it('يحترم الحالة الصريحة ABSENT/EXCUSED/LATE', () => {
    expect(resolveStatus('ABSENT', 30, 10)).toBe('ABSENT');
    expect(resolveStatus('EXCUSED', 0, 10)).toBe('EXCUSED');
    expect(resolveStatus('LATE', 0, 10)).toBe('LATE');
  });

  it('الحضور المستهلك للحصص هو PRESENT/LATE فقط', () => {
    expect(isAttendedStatus('PRESENT')).toBe(true);
    expect(isAttendedStatus('LATE')).toBe(true);
    expect(isAttendedStatus('ABSENT')).toBe(false);
    expect(isAttendedStatus('EXCUSED')).toBe(false);
  });
});

describe('كشف الغيابات المتتالية', () => {
  it('يعد الغيابات من الأحدث ويتوقف عند أول حضور', () => {
    expect(consecutiveAbsences([{ status: 'ABSENT' }, { status: 'ABSENT' }, { status: 'PRESENT' }])).toBe(2);
    expect(consecutiveAbsences([{ status: 'ABSENT' }, { status: 'LATE' }])).toBe(1);
    expect(consecutiveAbsences([{ status: 'PRESENT' }, { status: 'ABSENT' }])).toBe(0);
    expect(consecutiveAbsences([])).toBe(0);
  });

  it('ينبه عند بلوغ الحد من الإعدادات', () => {
    expect(shouldAlertAbsence(3, 3)).toBe(true);
    expect(shouldAlertAbsence(4, 3)).toBe(true);
    expect(shouldAlertAbsence(2, 3)).toBe(false);
    expect(shouldAlertAbsence(5, 0)).toBe(false); // تعطيل التنبيه
  });
});

describe('نافذة تعديل الحضور', () => {
  const sessionEnd = new Date(Date.UTC(2026, 9, 10, 18, 30, 0));

  it('داخل النافذة لا يتطلب صلاحية edit_past', () => {
    expect(isOutsideEditWindow(sessionEnd, new Date(sessionEnd.getTime() + 60 * 60_000), 120)).toBe(false);
    expect(isOutsideEditWindow(sessionEnd, new Date(sessionEnd.getTime() + 120 * 60_000), 120)).toBe(false);
  });

  it('خارج النافذة يتطلب الصلاحية', () => {
    expect(isOutsideEditWindow(sessionEnd, new Date(sessionEnd.getTime() + 121 * 60_000), 120)).toBe(true);
    expect(isOutsideEditWindow(sessionEnd, new Date(sessionEnd.getTime() + 24 * 3600_000), 120)).toBe(true);
  });
});
