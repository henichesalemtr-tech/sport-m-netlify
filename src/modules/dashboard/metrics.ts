/**
 * حسابات لوحة القيادة (8.1) — دوال نقية قابلة للاختبار دون قاعدة بيانات.
 * كل الأرقام في الواجهة مشتقة من هذه الحسابات فوق نتائج استعلامات حقيقية.
 */

export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

/**
 * نسبة الحضور = (حاضر + متأخر) / (حاضر + متأخر + غائب) × 100.
 * الغياب بعذر (EXCUSED) مستثنى من المقام (لا يُحتسب إخلالًا ولا حضورًا).
 */
export function attendanceRate(counts: AttendanceCounts): number | null {
  const denominator = counts.present + counts.late + counts.absent;
  if (denominator <= 0) return null;
  return Number((((counts.present + counts.late) / denominator) * 100).toFixed(1));
}

/** صافي الدخل = الإيرادات − المصاريف (minor units — BigInt فقط). */
export function netIncome(revenueMinor: bigint, expensesMinor: bigint): bigint {
  return revenueMinor - expensesMinor;
}

export type SubscriptionBucket = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'OTHER';

/**
 * تصنيف الاشتراك للوحة القيادة:
 * EXPIRING = نشط وينتهي خلال expiringDays (من الإعدادات).
 */
export function subscriptionBucket(
  status: string,
  endDate: Date,
  today: Date,
  expiringDays: number,
): SubscriptionBucket {
  if (status === 'EXPIRED') return 'EXPIRED';
  if (status !== 'ACTIVE') return 'OTHER';
  const horizon = new Date(today.getTime() + expiringDays * 86_400_000);
  if (endDate.getTime() < today.getTime()) return 'EXPIRED';
  if (endDate.getTime() <= horizon.getTime()) return 'EXPIRING';
  return 'ACTIVE';
}

export type Granularity = 'day' | 'week' | 'month' | 'year';

/** مفتاح سلسلة زمنية حسب الحبيبية (UTC). */
export function seriesBucketKey(date: Date, granularity: Granularity): string {
  const iso = date.toISOString();
  switch (granularity) {
    case 'day':
      return iso.slice(0, 10);
    case 'week':
      return `W${Math.floor(date.getTime() / (7 * 86_400_000))}`;
    case 'month':
      return iso.slice(0, 7);
    case 'year':
      return iso.slice(0, 4);
  }
}

/**
 * تجميع سلسلة (إيراد/مصروف) حسب الحبيبية مع ملء الفجوات بأصفار.
 * values: [تاريخ, مبلغ minor] — تُعاد مفاتيح مرتبة ومبالغ مجمعة.
 */
export function aggregateSeries(
  values: Array<{ date: Date; amountMinor: bigint }>,
  granularity: Granularity,
  rangeStart: Date,
  rangeEnd: Date,
): Array<{ key: string; total: bigint }> {
  const map = new Map<string, bigint>();
  for (const v of values) {
    const key = seriesBucketKey(v.date, granularity);
    map.set(key, (map.get(key) ?? 0n) + v.amountMinor);
  }
  const keys: string[] = [];
  const cursor = new Date(rangeStart.getTime());
  const stepMs =
    granularity === 'day' ? 86_400_000
    : granularity === 'week' ? 7 * 86_400_000
    : granularity === 'month' ? 0 // يُدار يدويًا
    : 0;
  if (granularity === 'month') {
    cursor.setUTCDate(1);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor.getTime() <= rangeEnd.getTime()) {
      const key = seriesBucketKey(cursor, 'month');
      if (!keys.includes(key)) keys.push(key);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else if (granularity === 'year') {
    cursor.setUTCMonth(0, 1);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor.getTime() <= rangeEnd.getTime()) {
      const key = seriesBucketKey(cursor, 'year');
      if (!keys.includes(key)) keys.push(key);
      cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    }
  } else {
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor.getTime() <= rangeEnd.getTime()) {
      const key = seriesBucketKey(cursor, granularity);
      if (!keys.includes(key)) keys.push(key);
      cursor.setTime(cursor.getTime() + stepMs);
    }
  }
  return keys.map((key) => ({ key, total: map.get(key) ?? 0n }));
}

/** نسبة مئوية آمنة (0 عند مقام صفري). */
export function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}
