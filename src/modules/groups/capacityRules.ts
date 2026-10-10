/**
 * منطق السعة النقي (قابل للاختبار دون قاعدة بيانات) — 7.6.
 * السعة تُحسب على العضويات النشطة فقط (leftAt = null).
 */

export interface CapacitySnapshot {
  maxCapacity: number;
  activeCount: number;
}

/** المقاعد المتبقية (لا تنزل تحت الصفر). */
export function availableSeats(snapshot: CapacitySnapshot): number {
  return Math.max(0, snapshot.maxCapacity - snapshot.activeCount);
}

/** هل تتجاوز إضافة `adding` أعضاء السعة القصوى؟ */
export function wouldExceedCapacity(snapshot: CapacitySnapshot, adding: number): boolean {
  return snapshot.activeCount + adding > snapshot.maxCapacity;
}

/** السعة بعد الإضافة/الإزالة (number قد يكون سالبًا عند الإزالة — يُثبَّت على 0). */
export function capacityAfter(snapshot: CapacitySnapshot, delta: number): number {
  return Math.max(0, snapshot.activeCount + delta);
}

/** نسبة الامتلاء مئوية (0-100+، تُقرَّب لرقم عشري واحد). */
export function occupancyPercent(snapshot: CapacitySnapshot): number {
  if (snapshot.maxCapacity <= 0) return 0;
  return Math.round((snapshot.activeCount / snapshot.maxCapacity) * 1000) / 10;
}

/** هل خفض السعة القصوى الجديدة يبقي الأعضاء الحاليين ضمن الحد؟ */
export function newMaxCapacityValid(snapshot: CapacitySnapshot, newMaxCapacity: number): boolean {
  return newMaxCapacity >= snapshot.activeCount;
}

// ---------- أيام التدريب (JSON في العمود groups.training_days) ----------

export const TRAINING_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export type TrainingDay = (typeof TRAINING_DAYS)[number];

/** تحليل عمود trainingDays (JSON) إلى قائمة أيام صالحة مرتبة بلا تكرار. */
export function parseTrainingDays(raw: string | null): TrainingDay[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const valid = parsed.filter(
    (d): d is TrainingDay =>
      typeof d === 'string' && (TRAINING_DAYS as readonly string[]).includes(d),
  );
  return [...new Set(valid)].sort(
    (a, b) => TRAINING_DAYS.indexOf(a) - TRAINING_DAYS.indexOf(b),
  );
}

export function serializeTrainingDays(days: TrainingDay[]): string {
  return JSON.stringify(parseTrainingDays(JSON.stringify(days)));
}

/** تحقق من صحة أوقات التدريب ("HH:mm" ونهاية بعد بداية). */
export function isValidTimeRange(startTime: string, endTime: string): boolean {
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRe.test(startTime) || !timeRe.test(endTime)) return false;
  return endTime > startTime;
}
