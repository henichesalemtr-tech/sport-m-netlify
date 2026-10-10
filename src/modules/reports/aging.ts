/**
 * تصنيف أعمار الديون (Aging) — دالة نقية قابلة للاختبار (7.14).
 * الشرائح: غير مستحق / 0-30 / 31-60 / +60 يومًا.
 */

export type AgingBucket = 'CURRENT' | '0-30' | '31-60' | '60+';

export const AGING_BUCKETS: readonly AgingBucket[] = ['CURRENT', '0-30', '31-60', '60+'];

export const AGING_LABELS: Record<AgingBucket, string> = {
  CURRENT: 'غير مستحق',
  '0-30': '0-30 يومًا',
  '31-60': '31-60 يومًا',
  '60+': 'أكثر من 60 يومًا',
};

/**
 * daysOverdue = عدد الأيام منذ تاريخ الاستحقاق (سالب = لم يستحق بعد).
 */
export function classifyAging(daysOverdue: number): AgingBucket {
  if (!Number.isFinite(daysOverdue) || daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return '0-30';
  if (daysOverdue <= 60) return '31-60';
  return '60+';
}

/** تجميع مبالغ (minor units) حسب شريحة العمر — للملخصات. */
export function agingSummary(
  entries: Array<{ daysOverdue: number; amountMinor: bigint }>,
): Record<AgingBucket, bigint> {
  const summary: Record<AgingBucket, bigint> = {
    CURRENT: 0n,
    '0-30': 0n,
    '31-60': 0n,
    '60+': 0n,
  };
  for (const e of entries) {
    summary[classifyAging(e.daysOverdue)] += e.amountMinor;
  }
  return summary;
}
