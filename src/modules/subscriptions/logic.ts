/**
 * منطق الاشتراكات النقي (7.9 / 7.10) — دوال قابلة للاختبار دون قاعدة بيانات.
 * المال BigInt بأصغر وحدة عبر @/shared/money (ممنوع float — 4.4).
 */
import { applyDiscount, type MinorUnits } from '@/shared/money';
import { addDays, diffInDays } from '@/shared/dates';

export type SubscriptionStatusValue =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'RENEWING'
  | 'CANCELLED';

export type DiscountInput = { kind: 'FIXED' | 'PERCENT'; value: MinorUnits };

/**
 * انتقالات الحالة المسموحة (7.10):
 * - ACTIVE → EXPIRED (تلقائي عند تجاوز endDate)
 * - ACTIVE ↔ SUSPENDED
 * - ACTIVE/EXPIRED → RENEWING (عند بدء التجديد — القديم لا يُمسح أبدًا)
 * - أي حالة → CANCELLED (بسبب إلزامي)
 */
const ALLOWED_TRANSITIONS: Record<SubscriptionStatusValue, SubscriptionStatusValue[]> = {
  ACTIVE: ['EXPIRED', 'SUSPENDED', 'RENEWING', 'CANCELLED'],
  EXPIRED: ['RENEWING', 'CANCELLED'],
  SUSPENDED: ['ACTIVE', 'CANCELLED'],
  RENEWING: ['CANCELLED'],
  CANCELLED: [],
};

export function canTransition(
  from: SubscriptionStatusValue,
  to: SubscriptionStatusValue,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** نهاية الاشتراك = البداية + المدة − يوم (يوم البداية يُحتسب). */
export function deriveEndDate(startDate: Date, durationDays: number): Date {
  return addDays(startDate, durationDays - 1);
}

/** طول فترة اشتراك سابق (بالأيام) — يُعاد استخدامه عند تجديد نوع بلا مدة ثابتة. */
export function periodLengthDays(startDate: Date, endDate: Date): number {
  return diffInDays(startDate, endDate) + 1;
}

/**
 * بداية التجديد (7.9): اليوم التالي لنهاية القديم؛
 * وإذا كان القديم منتهيًا (endDate < today) وإعداد "البدء من اليوم" مفعّل → اليوم.
 */
export function computeRenewalStart(opts: {
  previousEnd: Date;
  today: Date;
  startFromTodayWhenExpired: boolean;
}): Date {
  const expired = opts.previousEnd.getTime() < opts.today.getTime();
  if (expired && opts.startFromTodayWhenExpired) return opts.today;
  return addDays(opts.previousEnd, 1);
}

/** انتهاء فعلي (لقراءة الحالة قبل تشغيل مهمة auto-expire). */
export function isEffectivelyExpired(
  status: SubscriptionStatusValue,
  endDate: Date,
  today: Date,
): boolean {
  return status === 'ACTIVE' && endDate.getTime() < today.getTime();
}

/**
 * صافي الاشتراك بعد الخصم — الخصم لا يتجاوز السعر أبدًا (applyDiscount يثبت ذلك).
 * قيمة PERCENT مخزنة كنسبة×100 (1250 = 12.5%) والتقريب لأسفل لأصغر وحدة.
 */
export function computeSubscriptionNet(
  price: MinorUnits,
  discount: DiscountInput | null,
): { discountAmount: MinorUnits; net: MinorUnits } {
  return applyDiscount(price, discount);
}

/** تحقق: الخصم الثابت يجب ألا يتجاوز السعر (يُرفض قبل التخزين — 7.9). */
export function fixedDiscountExceedsPrice(price: MinorUnits, discountValue: MinorUnits): boolean {
  return discountValue > price;
}

/** هل توجد حالتان نشطتان لنفس (رياضي، نشاط)؟ — قائمة حالات تُعد "شغالة". */
export function isOccupyingStatus(status: SubscriptionStatusValue): boolean {
  return status === 'ACTIVE';
}
