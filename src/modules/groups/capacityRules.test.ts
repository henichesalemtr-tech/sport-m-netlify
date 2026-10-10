import { describe, expect, it } from 'vitest';
import {
  availableSeats,
  capacityAfter,
  isValidTimeRange,
  newMaxCapacityValid,
  occupancyPercent,
  parseTrainingDays,
  serializeTrainingDays,
  wouldExceedCapacity,
} from './capacityRules';

describe('حسابات سعة المجموعات', () => {
  it('يحسب المقاعد المتبقية ولا ينزل تحت الصفر', () => {
    expect(availableSeats({ maxCapacity: 20, activeCount: 12 })).toBe(8);
    expect(availableSeats({ maxCapacity: 10, activeCount: 10 })).toBe(0);
    expect(availableSeats({ maxCapacity: 10, activeCount: 12 })).toBe(0);
  });

  it('يكتشف تجاوز السعة عند الإضافة', () => {
    expect(wouldExceedCapacity({ maxCapacity: 20, activeCount: 19 }, 1)).toBe(false);
    expect(wouldExceedCapacity({ maxCapacity: 20, activeCount: 20 }, 1)).toBe(true);
    expect(wouldExceedCapacity({ maxCapacity: 20, activeCount: 18 }, 3)).toBe(true);
  });

  it('يحسب عدد الأعضاء بعد الإضافة/الإزالة بحد أدنى صفر', () => {
    expect(capacityAfter({ maxCapacity: 20, activeCount: 5 }, 3)).toBe(8);
    expect(capacityAfter({ maxCapacity: 20, activeCount: 2 }, -5)).toBe(0);
  });

  it('يحسب نسبة الامتلاء مقربة لعشري واحد', () => {
    expect(occupancyPercent({ maxCapacity: 3, activeCount: 1 })).toBe(33.3);
    expect(occupancyPercent({ maxCapacity: 4, activeCount: 2 })).toBe(50);
    expect(occupancyPercent({ maxCapacity: 0, activeCount: 0 })).toBe(0);
  });

  it('يمنع خفض السعة القصوى تحت عدد الأعضاء الحاليين', () => {
    expect(newMaxCapacityValid({ maxCapacity: 20, activeCount: 15 }, 15)).toBe(true);
    expect(newMaxCapacityValid({ maxCapacity: 20, activeCount: 15 }, 14)).toBe(false);
  });
});

describe('أيام التدريب (JSON)', () => {
  it('يحلل قائمة أيام صالحة مرتبة بلا تكرار', () => {
    expect(parseTrainingDays('["MON","SAT","MON"]')).toEqual(['MON', 'SAT']);
    expect(parseTrainingDays(null)).toEqual([]);
    expect(parseTrainingDays('bad-json')).toEqual([]);
    expect(parseTrainingDays('{"a":1}')).toEqual([]);
  });

  it('يتجاهل القيم غير الصالحة', () => {
    expect(parseTrainingDays('["SUN","XXX",5,"FRI"]')).toEqual(['SUN', 'FRI']);
  });

  it('يسلسل الأيام بشكل قابل للتكرار', () => {
    expect(serializeTrainingDays(['SAT', 'MON'])).toBe('["MON","SAT"]');
  });
});

describe('صحة أوقات التدريب', () => {
  it('يقبل فترة صالحة', () => {
    expect(isValidTimeRange('17:00', '18:30')).toBe(true);
  });

  it('يرفض نهاية قبل/تساوي البداية أو صيغة خاطئة', () => {
    expect(isValidTimeRange('18:00', '17:00')).toBe(false);
    expect(isValidTimeRange('17:00', '17:00')).toBe(false);
    expect(isValidTimeRange('24:00', '25:00')).toBe(false);
    expect(isValidTimeRange('17:0', '18:00')).toBe(false);
  });
});
