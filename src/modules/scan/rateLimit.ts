/**
 * معدّل معدل بسيط في الذاكرة (Sliding Window) لعمليات المسح — 7.9.
 * لكل مفتاح (مستخدم/جهاز) قائمة طوابع ضمن آخر دقيقة.
 * (في انتشار متعدد العقد يُستبدل بـ Redis — نفس الواجهة.)
 */

const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

/** هل الطلب مسموح؟ يسجل الطابع عند السماح. */
export function allowRequest(key: string, limitPerMinute: number, now: number = Date.now()): boolean {
  const cutoff = now - WINDOW_MS;
  const recent = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= limitPerMinute) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

/** عدد الطلبات الحالية في النافذة (للاختبارات/المراقبة). */
export function currentCount(key: string, now: number = Date.now()): number {
  const cutoff = now - WINDOW_MS;
  return (buckets.get(key) ?? []).filter((t) => t > cutoff).length;
}

/** تفريغ السلال (اختبارات فقط). */
export function resetRateLimiter(): void {
  buckets.clear();
}
