/**
 * منطق الحضور النقي (قابل للاختبار دون قاعدة بيانات) — 7.8.
 */

export type AttendanceStatusValue = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

/** الحالات التي تُحتسب حضورًا (تستهلك حصة في اشتراك الحصص). */
export function isAttendedStatus(status: AttendanceStatusValue): boolean {
  return status === 'PRESENT' || status === 'LATE';
}

/**
 * تحديد الحالة تلقائيًا: إذا وصلت القيمة الفعلية بعد بداية الحصة
 * بدقائق > الحد المسموح (lateThresholdMinutes) تُسجَّل LATE.
 */
export function resolveStatus(
  requested: AttendanceStatusValue | undefined,
  minutesLate: number,
  lateThresholdMinutes: number,
): AttendanceStatusValue {
  if (requested === 'ABSENT' || requested === 'EXCUSED') return requested;
  if (requested === 'LATE') return 'LATE';
  return minutesLate > lateThresholdMinutes ? 'LATE' : 'PRESENT';
}

export interface RecordLike {
  status: string;
}

/**
 * عدد الغيابات المتتالية في سجلات مرتبة من الأحدث للأقدم.
 * يتوقف العد عند أول سجل غير ABSENT.
 */
export function consecutiveAbsences(recordsNewestFirst: RecordLike[]): number {
  let count = 0;
  for (const r of recordsNewestFirst) {
    if (r.status === 'ABSENT') count++;
    else break;
  }
  return count;
}

/** هل يستوجب عدد الغيابات المتتالية تنبيهًا؟ (الحد من الإعدادات) */
export function shouldAlertAbsence(consecutive: number, threshold: number): boolean {
  return threshold > 0 && consecutive >= threshold;
}

/** هل سقط التعديل خارج نافذة التعديل المسموحة؟ */
export function isOutsideEditWindow(
  sessionEnd: Date,
  editedAt: Date,
  editWindowMinutes: number,
): boolean {
  const deadline = sessionEnd.getTime() + editWindowMinutes * 60_000;
  return editedAt.getTime() > deadline;
}
