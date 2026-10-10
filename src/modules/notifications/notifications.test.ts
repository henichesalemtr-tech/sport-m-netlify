import { describe, expect, it } from 'vitest';
import { dayBucket, dedupeKeys, makeDedupeKey, monthBucket } from './dedupe';

describe('makeDedupeKey — البنية الأساسية', () => {
  it('نمط ثابت: النوع:الكيان:المعرّف[:الدلو]', () => {
    expect(makeDedupeKey('NEW_PAYMENT', 'Payment', 'p-1')).toBe('NEW_PAYMENT:Payment:p-1');
    expect(makeDedupeKey('NEW_PAYMENT', 'Payment', 'p-1', 'b')).toBe('NEW_PAYMENT:Payment:p-1:b');
  });

  it('يوم/شهر Bucket ثابتان من Date أو نص', () => {
    expect(dayBucket(new Date('2026-03-15T23:59:00Z'))).toBe('2026-03-15');
    expect(dayBucket('2026-03-15T00:00:00Z')).toBe('2026-03-15');
    expect(monthBucket(new Date('2026-03-15T00:00:00Z'))).toBe('2026-03');
  });
});

describe('توليد مفاتيح Idempotent لكل نوع إشعار', () => {
  const subId = 'sub-123';
  const end = new Date('2026-04-01T00:00:00Z');

  it('نفس الحدث ⇒ نفس المفتاح دائمًا (حتمية)', () => {
    const a = dedupeKeys.subscriptionExpiring(subId, end);
    const b = dedupeKeys.subscriptionExpiring(subId, end);
    expect(a).toBe(b);
  });

  it('أحداث مختلفة ⇒ مفاتيح مختلفة (اشتراك/تاريخ)', () => {
    expect(dedupeKeys.subscriptionExpiring(subId, end)).not.toBe(
      dedupeKeys.subscriptionExpiring('sub-999', end),
    );
    expect(dedupeKeys.subscriptionExpiring(subId, end)).not.toBe(
      dedupeKeys.subscriptionExpiring(subId, new Date('2026-05-01T00:00:00Z')),
    );
  });

  it('أنواع مختلفة لا تتصادم', () => {
    expect(dedupeKeys.subscriptionExpiring(subId, end)).not.toBe(
      dedupeKeys.subscriptionExpired(subId, end),
    );
  });

  it('الهدف يُضاف للدلو حتى لا يتصادم إشعارا مستخدمين لنفس الحدث', () => {
    const noTarget = dedupeKeys.subscriptionExpired(subId, end);
    const u1 = dedupeKeys.subscriptionExpired(subId, end, 'user-1');
    const u2 = dedupeKeys.subscriptionExpired(subId, end, 'user-2');
    expect(u1).not.toBe(u2);
    expect(u1).not.toBe(noTarget);
    expect(u1.endsWith('user-1')).toBe(true);
  });

  it('مفاتيح الأنواع المتبقية تتبع النمط وتتضمن المعرّفات', () => {
    expect(dedupeKeys.absence('ath-1', 'ses-1')).toContain('ABSENCE');
    expect(dedupeKeys.absence('ath-1', 'ses-1')).toContain('ath-1_ses-1');
    expect(dedupeKeys.consecutiveAbsence('ath-1', '2026-03-01', 3)).toBe(
      'CONSECUTIVE_ABSENCE:Athlete:ath-1:2026-03-01_3',
    );
    expect(dedupeKeys.repeatedLate('ath-1', new Date('2026-03-15T00:00:00Z'))).toBe(
      'REPEATED_LATE:Athlete:ath-1:2026-03',
    );
    expect(dedupeKeys.newPayment('pay-1')).toBe('NEW_PAYMENT:Payment:pay-1');
    expect(dedupeKeys.overdueDebt(subId, '2026-02-01')).toBe('OVERDUE_DEBT:Subscription:sub-123:2026-02-01');
    expect(dedupeKeys.upcomingSession('ses-1')).toBe('UPCOMING_SESSION:TrainingSession:ses-1');
    expect(dedupeKeys.upcomingSession('ses-1', 'coach-9')).toContain('coach-9');
    expect(dedupeKeys.sessionCancelled('ses-1')).toBe('SESSION_CANCELLED:TrainingSession:ses-1');
    expect(dedupeKeys.sessionRescheduled('ses-1', new Date('2026-03-20T18:00:00Z'))).toContain(
      'SESSION_RESCHEDULED:TrainingSession:ses-1',
    );
    expect(dedupeKeys.documentExpiring('doc-1', '2026-04-10')).toBe(
      'DOCUMENT_EXPIRING:AthleteDocument:doc-1:2026-04-10',
    );
  });

  it('المعرّفات التي تحتوي مسافات/نقطتين تُنظَّف ولا تكسر النمط', () => {
    const key = dedupeKeys.newPayment(' id:with spaces ');
    expect(key).not.toContain(' ');
    expect(key).not.toContain('::');
  });
});
