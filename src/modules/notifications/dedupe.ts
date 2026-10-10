/**
 * مفاتيح إلغاء التكرار (dedupeKey) للإشعارات — 7.16.
 * دوال نقية قابلة للاختبار: نفس الحدث يولّد نفس المفتاح دائمًا،
 * والقيد الفريد على Notification.dedupeKey يجعل التوليد Idempotent.
 */
import type { NotificationType } from '@prisma/client';

/** بناء مفتاح عام: النوع + الكيان + المعرّف + دلالة زمنية/سياقية (bucket). */
export function makeDedupeKey(
  type: NotificationType,
  entityType: string,
  entityId: string,
  bucket?: string,
): string {
  const clean = (s: string) => s.replace(/[:\s]+/g, '_');
  const base = `${type}:${clean(entityType)}:${clean(entityId)}`;
  return bucket ? `${base}:${clean(bucket)}` : base;
}

/** تاريخ YYYY-MM-DD من Date (UTC) لتثبيت المفتاح. */
export function dayBucket(date: Date | string): string {
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/** دلالة شهرية YYYY-MM (للتنبيهات المتكررة شهريًا). */
export function monthBucket(date: Date | string): string {
  return dayBucket(date).slice(0, 7);
}

/**
 * مفاتيح كل نوع إشعار حسب جدول 7.16.
 * ملاحظة: عند توجيه إشعار لنفس الحدث لأكثر من هدف (مستخدم/دور)
 * يُلحق معرّف الهدف بالـ bucket حتى لا يتصادم القيد الفريد.
 */
export const dedupeKeys = {
  subscriptionExpiring: (subscriptionId: string, endDate: Date | string, target?: string) =>
    makeDedupeKey('SUBSCRIPTION_EXPIRING', 'Subscription', subscriptionId, withTarget(dayBucket(endDate), target)),
  subscriptionExpired: (subscriptionId: string, endDate: Date | string, target?: string) =>
    makeDedupeKey('SUBSCRIPTION_EXPIRED', 'Subscription', subscriptionId, withTarget(dayBucket(endDate), target)),
  absence: (athleteId: string, sessionId: string) =>
    makeDedupeKey('ABSENCE', 'AttendanceRecord', `${athleteId}_${sessionId}`),
  consecutiveAbsence: (athleteId: string, day: Date | string, streak: number) =>
    makeDedupeKey('CONSECUTIVE_ABSENCE', 'Athlete', athleteId, `${dayBucket(day)}_${streak}`),
  repeatedLate: (athleteId: string, month: Date | string) =>
    makeDedupeKey('REPEATED_LATE', 'Athlete', athleteId, monthBucket(month)),
  newPayment: (paymentId: string) =>
    makeDedupeKey('NEW_PAYMENT', 'Payment', paymentId),
  overdueDebt: (subscriptionId: string, dueDate: Date | string, target?: string) =>
    makeDedupeKey('OVERDUE_DEBT', 'Subscription', subscriptionId, withTarget(dayBucket(dueDate), target)),
  upcomingSession: (sessionId: string, target?: string) =>
    makeDedupeKey('UPCOMING_SESSION', 'TrainingSession', sessionId, target),
  sessionRescheduled: (sessionId: string, newStart: Date | string) =>
    makeDedupeKey('SESSION_RESCHEDULED', 'TrainingSession', sessionId, new Date(newStart).toISOString()),
  sessionCancelled: (sessionId: string) =>
    makeDedupeKey('SESSION_CANCELLED', 'TrainingSession', sessionId),
  documentExpiring: (documentId: string, expiryDate: Date | string) =>
    makeDedupeKey('DOCUMENT_EXPIRING', 'AthleteDocument', documentId, dayBucket(expiryDate)),
} as const;

function withTarget(bucket: string, target?: string): string {
  return target ? `${bucket}#${target}` : bucket;
}
