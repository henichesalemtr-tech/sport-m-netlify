import { describe, expect, it } from 'vitest';
import {
  describeConflict,
  findSessionConflicts,
  generateRecurringDates,
  isExclusionViolation,
  rangesOverlap,
  zonedTimeToUtc,
  type ExistingSessionSlot,
} from './recurrence';

describe('توليد تواريخ الحصص المتكررة', () => {
  it('يولد تواريخ أيام الأسبوع المطلوبة ضمن النافذة', () => {
    // 2026-10-05 هو الاثنين
    const dates = generateRecurringDates({
      days: ['MON', 'THU'],
      from: new Date(Date.UTC(2026, 9, 5)),
      to: new Date(Date.UTC(2026, 9, 18)),
    });
    expect(dates).toEqual(['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15']);
  });

  it('يعيد قائمة فارغة لأيام غير صالحة أو نافذة فارغة', () => {
    expect(generateRecurringDates({ days: [], from: new Date(Date.UTC(2026, 9, 5)), to: new Date(Date.UTC(2026, 9, 12)) })).toEqual([]);
    expect(generateRecurringDates({ days: ['XXX'], from: new Date(Date.UTC(2026, 9, 5)), to: new Date(Date.UTC(2026, 9, 12)) })).toEqual([]);
    expect(generateRecurringDates({ days: ['MON'], from: new Date(Date.UTC(2026, 9, 12)), to: new Date(Date.UTC(2026, 9, 5)) })).toEqual([]);
  });

  it('يشمل يومي البداية والنهاية عندما يطابقان الأيام المطلوبة', () => {
    const dates = generateRecurringDates({
      days: ['SAT'],
      from: new Date(Date.UTC(2026, 9, 3)), // السبت
      to: new Date(Date.UTC(2026, 9, 3)),
    });
    expect(dates).toEqual(['2026-10-03']);
  });

  it('يحمي من النوافذ الضخمة (حد 400 يوم)', () => {
    const dates = generateRecurringDates({
      days: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
      from: new Date(Date.UTC(2026, 0, 1)),
      to: new Date(Date.UTC(2030, 0, 1)),
    });
    expect(dates.length).toBe(400);
  });
});

describe('كشف تعارض الحصص (نصف مفتوح [start, end))', () => {
  const t = (h: number, m = 0): Date => new Date(Date.UTC(2026, 9, 10, h, m));

  it('rangesOverlap: التلامس عند الحدود ليس تعارضًا', () => {
    expect(rangesOverlap(t(17), t(18), t(18), t(19))).toBe(false);
    expect(rangesOverlap(t(18), t(19), t(17), t(18))).toBe(false);
    expect(rangesOverlap(t(17), t(18), t(17, 59), t(19))).toBe(true);
    expect(rangesOverlap(t(17), t(19), t(18), t(18, 30))).toBe(true);
  });

  const slot = (over: Partial<ExistingSessionSlot> = {}): ExistingSessionSlot => ({
    id: 's1',
    title: 'حصة كاراطي',
    coachId: 'c1',
    venueId: 'v1',
    groupId: 'g1',
    startTime: t(17),
    endTime: t(18),
    ...over,
  });

  it('يكتشف تعارض المدرب والقاعة والمجموعة ويسمي كل مورد', () => {
    const conflicts = findSessionConflicts(
      { coachId: 'c1', venueId: 'v1', groupId: 'g1', startTime: t(17, 30), endTime: t(18, 30) },
      [slot()],
    );
    expect(conflicts.map((c) => c.resource).sort()).toEqual(['coach', 'group', 'venue']);
    expect(describeConflict(conflicts[0]!)).toContain('حصة كاراطي');
  });

  it('لا يعتبر التلامس أو الموارد المختلفة تعارضًا', () => {
    expect(
      findSessionConflicts({ coachId: 'c1', venueId: null, groupId: null, startTime: t(18), endTime: t(19) }, [slot()]),
    ).toHaveLength(0);
    expect(
      findSessionConflicts({ coachId: 'c2', venueId: 'v2', groupId: 'g2', startTime: t(17), endTime: t(18) }, [slot()]),
    ).toHaveLength(0);
  });

  it('يستثني المعرفات المحددة (سلسلة الحصة نفسها)', () => {
    const conflicts = findSessionConflicts(
      { coachId: 'c1', venueId: null, groupId: null, startTime: t(17), endTime: t(18), excludeIds: ['s1'] },
      [slot()],
    );
    expect(conflicts).toHaveLength(0);
  });
});

describe('دمج التاريخ والوقت بمنطقة المؤسسة', () => {
  it('يحول 17:00 في Africa/Algiers (UTC+1) إلى 16:00 UTC', () => {
    const utc = zonedTimeToUtc('2026-10-10', '17:00', 'Africa/Algiers');
    expect(utc.toISOString()).toBe('2026-10-10T16:00:00.000Z');
  });

  it('يتعامل مع UTC مباشرة', () => {
    expect(zonedTimeToUtc('2026-10-10', '08:30', 'UTC').toISOString()).toBe('2026-10-10T08:30:00.000Z');
  });

  it('يتعامل مع الإزاحة السالبة (America/New_York صيفًا UTC-4)', () => {
    expect(zonedTimeToUtc('2026-07-10', '12:00', 'America/New_York').toISOString()).toBe(
      '2026-07-10T16:00:00.000Z',
    );
  });
});

describe('كشف انتهاك قيد الاستبعاد 23P01', () => {
  it('يتعرف على الخطأ الخام بالكود 23P01', () => {
    expect(isExclusionViolation({ code: '23P01' })).toBe(true);
    expect(isExclusionViolation({ code: '23505' })).toBe(false);
    expect(isExclusionViolation(null)).toBe(false);
    expect(isExclusionViolation('23P01')).toBe(false);
  });
});
