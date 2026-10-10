import type { AttendanceRecord } from '@prisma/client';
import { AppError, ErrorCode, businessRule, notFound } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { hmacSign, sha256 } from '@/shared/auth/password';
import { getEnv } from '@/shared/config/env';
import { getScanSettings } from '@/shared/config/settings';
import { remaining } from '@/shared/money';
import { parseDateOnly, todayIn } from '@/shared/dates';
import { getSettings } from '@/modules/settings/service';
import { attendanceService } from '@/modules/attendance/service';
import { scanRepository, type ScanMembershipRow } from './repository';
import { allowRequest } from './rateLimit';
import type { ScanRequestInput } from './schema';

export type PaymentState = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface ScanCard {
  duplicate: boolean;
  athlete: {
    id: string;
    registrationNo: string;
    fullName: string;
    photoUrl: string | null;
    status: string;
  };
  groups: ScanMembershipRow[];
  subscription: {
    status: string;
    expired: boolean;
    typeName: string;
    typeKind: string;
    endDate: Date;
    remainingAmount: string;
    sessionsTotal: number | null;
    sessionsUsed: number;
  } | null;
  payment: { state: PaymentState; remaining: string } | null;
  session: { id: string; title: string } | null;
  attendance: AttendanceRecord | null;
  warnings: string[];
}

export const scanService = {
  /**
   * حل رمز المسح (7.9):
   * تحقق HMAC/SHA-256 → بطاقة الرياضي → منع التكرار ضمن scan.dedupSeconds →
   * سياسة الاشتراك المنتهي (Settings) → تسجيل الحضور حسب القواعد.
   */
  async resolve(input: ScanRequestInput, meta: Meta): Promise<ScanCard> {
    // 1) تحديد المعدل (Settings-driven)
    const scanSettings = await getScanSettings();
    const rateKey = `${meta.user.userId}:${meta.ip ?? 'local'}`;
    if (!allowRequest(rateKey, scanSettings.rateLimitPerMinute)) {
      throw new AppError(ErrorCode.RATE_LIMITED, 'عمليات مسح كثيرة خلال دقيقة — حاول بعد لحظات');
    }

    // 2) التحقق من الرمز: يقبل تجزئة SHA-256 أو HMAC بـ APP_SECRET
    const hashes = [sha256(input.code), hmacSign(input.code, getEnv().APP_SECRET)];
    const athlete = await scanRepository.findAthleteByScanHashes(hashes);
    // لا نكشف سبب الفشل (منع تعداد الرموز)
    if (!athlete) throw notFound('رمز المسح');

    const app = await getSettings();
    const today = todayIn(app.timezone);
    const warnings: string[] = [];
    if (athlete.status !== 'ACTIVE') {
      if (athlete.status === 'BLOCKED' || athlete.status === 'SUSPENDED') {
        throw businessRule('لا يمكن تسجيل حضور رياضي محظور/موقوف', { status: athlete.status });
      }
      warnings.push(`حالة الرياضي ${athlete.status}`);
    }

    const groups = await scanRepository.findActiveGroups(athlete.id);
    const sub = await scanRepository.findLatestSubscription(athlete.id);
    const subExpired =
      sub === null ||
      sub.status === 'EXPIRED' ||
      sub.endDate < parseDateOnly(today);

    // 3) سياسة الاشتراك المنتهي من الإعدادات (block|warn|allow)
    if (subExpired) {
      if (scanSettings.expiredSubscriptionPolicy === 'block') {
        throw businessRule('الاشتراك منتهٍ — جدّد الاشتراك قبل تسجيل الحضور', {
          subscriptionStatus: sub?.status ?? 'NONE',
        });
      }
      if (scanSettings.expiredSubscriptionPolicy === 'warn') {
        warnings.push('الاشتراك منتهٍ أو غير موجود');
      }
    }

    const at = input.at ? new Date(input.at) : new Date();

    // 4) منع التكرار ضمن نافذة scan.dedupSeconds
    const dedupSince = new Date(at.getTime() - app.scanDedupSeconds * 1000);
    const recent = await scanRepository.findRecentAttendance(athlete.id, dedupSince);

    const card: ScanCard = {
      duplicate: false,
      athlete: {
        id: athlete.id,
        registrationNo: athlete.registrationNo,
        fullName: `${athlete.firstName} ${athlete.lastName}`,
        photoUrl: athlete.photoUrl,
        status: athlete.status,
      },
      groups,
      subscription: sub
        ? {
            status: sub.status,
            expired: subExpired,
            typeName: sub.typeName,
            typeKind: sub.typeKind,
            endDate: sub.endDate,
            remainingAmount: remaining(sub.netAmount, sub.paidAmount).toString(),
            sessionsTotal: sub.sessionsTotal,
            sessionsUsed: sub.sessionsUsed,
          }
        : null,
      payment: sub
        ? (() => {
            const due = remaining(sub.netAmount, sub.paidAmount);
            const state: PaymentState =
              due <= 0n ? 'PAID' : sub.paidAmount > 0n ? 'PARTIAL' : 'UNPAID';
            return { state, remaining: due.toString() };
          })()
        : null,
      session: null,
      attendance: null,
      warnings,
    };

    if (recent) {
      card.duplicate = true;
      card.attendance = recent;
      card.session = { id: recent.sessionId, title: '' };
      return card;
    }

    // 5) تحديد الحصة: صريحة أو حصة اليوم لمجموعات الرياضي
    let session = input.sessionId
      ? await scanRepository.findSessionById(input.sessionId)
      : await scanRepository.findSessionForGroups(
          groups.map((g) => g.groupId),
          parseDateOnly(today),
          at,
        );
    if (session && session.status !== 'SCHEDULED') {
      warnings.push('الحصة المستهدفة ليست في حالة SCHEDULED');
      session = null;
    }
    if (!session) {
      warnings.push('لا توجد حصة اليوم لهذه المجموعات — لم يُسجَّل الحضور');
      return card;
    }
    card.session = { id: session.id, title: session.title };

    // 6) تسجيل الحضور حسب قواعد وحدة الحضور (عضوية نشطة + تأخر تلقائي + استهلاك حصص)
    try {
      card.attendance = await attendanceService.record(
        {
          sessionId: session.id,
          athleteId: athlete.id,
          method: 'QR',
          recordedAt: input.at ?? at.toISOString(),
          notes: null,
        },
        meta,
      );
    } catch (e) {
      if (e instanceof AppError && (e.code === ErrorCode.CONFLICT || e.code === ErrorCode.DUPLICATE_RECORD)) {
        card.duplicate = true;
        card.warnings.push(e.message);
        return card;
      }
      throw e;
    }
    return card;
  },
};
