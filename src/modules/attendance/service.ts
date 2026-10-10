import type { AttendanceRecord } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, businessRule, conflict, forbidden, notFound } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import type { AuthContext } from '@/shared/permissions/guard';
import { hasPermission } from '@/shared/permissions/guard';
import { coachGroupIds, isScopeRestricted, toScoped } from '@/shared/permissions/scope';
import { lateMinutes as computeLateMinutes, parseDateOnly, todayIn } from '@/shared/dates';
import { isUniqueViolation } from '@/shared/idempotency';
import { getAttendanceSettings, appTimeZone, type AttendanceSettings } from '@/shared/config/settings';
import { getSettings } from '@/modules/settings/service';
import { attendanceRepository, type SessionForAttendance, type SheetRecordRow } from './repository';
import {
  consecutiveAbsences,
  isAttendedStatus,
  isOutsideEditWindow,
  resolveStatus,
  shouldAlertAbsence,
  type AttendanceStatusValue,
} from './absenceRules';
import type {
  AttendanceListQuery,
  BulkAttendanceEntry,
  BulkAttendanceInput,
  RecordAttendanceInput,
  UpdateAttendanceInput,
} from './schema';

const ENTITY = 'AttendanceRecord';
const EDIT_PAST_PERMISSION = 'attendance.edit_past';

interface PreparedSession extends SessionForAttendance {
  groupId: string;
}

/** تحضير الحصة: موجودة، غير ملغاة، ومرتبطة بمجموعة. */
async function prepareSession(sessionId: string, tx: PrismaTransaction): Promise<PreparedSession> {
  const session = await attendanceRepository.findSession(sessionId, tx);
  if (!session) throw notFound('الحصة');
  if (session.status === 'CANCELLED') {
    throw businessRule('لا يمكن تسجيل حضور لحصة ملغاة');
  }
  if (!session.groupId) {
    throw businessRule('الحصة غير مرتبطة بمجموعة — لا يمكن تسجيل الحضور');
  }
  return { ...session, groupId: session.groupId };
}

/** دقائق التأخر من وقت بداية الحصة مقابل وقت التسجيل الفعلي. */
function minutesLateFor(session: PreparedSession, recordedAt?: string): number {
  const actual = recordedAt ? new Date(recordedAt) : new Date();
  return computeLateMinutes(session.startTime, actual);
}

/** استهلاك حصة من اشتراك الحصص (SESSIONS) داخل نفس المعاملة — يُعكس عند التصحيح. */
async function consumeSessionQuota(
  tx: PrismaTransaction,
  athleteId: string,
  sessionDate: Date,
): Promise<boolean> {
  const sub = await attendanceRepository.findSessionsSubscription(athleteId, sessionDate, tx);
  if (!sub) return false;
  if (sub.sessionsTotal !== null && sub.sessionsUsed >= sub.sessionsTotal) return false;
  await attendanceRepository.adjustSessionsUsed(sub.id, +1, tx);
  return true;
}

async function reverseSessionQuota(
  tx: PrismaTransaction,
  athleteId: string,
  sessionDate: Date,
): Promise<boolean> {
  const sub = await attendanceRepository.findSessionsSubscription(athleteId, sessionDate, tx);
  if (!sub || sub.sessionsUsed <= 0) return false;
  await attendanceRepository.adjustSessionsUsed(sub.id, -1, tx);
  return true;
}

/** تنبيه بعد N غيابات متتالية (الحد من الإعدادات) — Notification مع dedupeKey. */
async function maybeAlertConsecutiveAbsence(
  tx: PrismaTransaction,
  athleteId: string,
  settings: AttendanceSettings,
): Promise<void> {
  const recent = await attendanceRepository.recentByAthlete(athleteId, settings.consecutiveAbsenceAlert + 1, tx);
  const streak = consecutiveAbsences(recent);
  if (!shouldAlertAbsence(streak, settings.consecutiveAbsenceAlert)) return;
  const day = todayIn(appTimeZone());
  await tx.notification.createMany({
    data: [
      {
        type: 'CONSECUTIVE_ABSENCE',
        roleTarget: 'RECEPTION',
        title: 'تنبيه غيابات متتالية',
        body: `الرياضي ${athleteId} غاب ${streak} حصصًا متتالية`,
        entityType: 'Athlete',
        entityId: athleteId,
        dedupeKey: `consecutive-absence:${athleteId}:${day}:${streak}`,
      },
    ],
    skipDuplicates: true,
  });
}

/** إنشاء سجل واحد داخل Transaction (قواعد 7.8 كاملة). */
async function createRecord(
  tx: PrismaTransaction,
  session: PreparedSession,
  entry: {
    athleteId: string;
    status?: AttendanceStatusValue;
    method: RecordAttendanceInput['method'];
    recordedAt?: string;
    minutesLate?: number;
    notes?: string | null;
    idempotencyKey?: string;
  },
  settings: AttendanceSettings,
  meta: Meta,
): Promise<AttendanceRecord> {
  const isMember = await attendanceRepository.isAthleteActiveMember(session.groupId, entry.athleteId, tx);
  if (!isMember) {
    throw businessRule('الرياضي ليس عضوًا نشطًا في مجموعة هذه الحصة', {
      athleteId: entry.athleteId,
      groupId: session.groupId,
    });
  }

  const existing = await attendanceRepository.findForAthleteSession(entry.athleteId, session.id, tx);
  if (existing) {
    throw conflict('يوجد سجل حضور لهذا الرياضي في هذه الحصة مسبقًا', { recordId: existing.id });
  }

  const rawLate = entry.minutesLate ?? minutesLateFor(session, entry.recordedAt);
  const status = resolveStatus(entry.status, rawLate, settings.lateThresholdMinutes);
  const minutesLate = status === 'LATE' ? rawLate : 0;
  const consumed = isAttendedStatus(status)
    ? await consumeSessionQuota(tx, entry.athleteId, session.sessionDate)
    : false;

  let record: AttendanceRecord;
  try {
    record = await attendanceRepository.create(
      {
        athleteId: entry.athleteId,
        sessionId: session.id,
        groupId: session.groupId,
        status,
        method: entry.method,
        recordDate: session.sessionDate,
        recordedAt: entry.recordedAt ? new Date(entry.recordedAt) : new Date(),
        recordedBy: meta.user.userId,
        minutesLate,
        consumedSession: consumed,
        idempotencyKey: entry.idempotencyKey ?? null,
        notes: entry.notes ?? null,
      },
      tx,
    );
  } catch (e) {
    // القيد الفريد (athlete, session) — P2002
    if (isUniqueViolation(e)) {
      throw conflict('يوجد سجل حضور لهذا الرياضي في هذه الحصة مسبقًا');
    }
    throw e;
  }

  if (status === 'ABSENT') await maybeAlertConsecutiveAbsence(tx, entry.athleteId, settings);
  await writeAudit(
    {
      userId: meta.user.userId,
      action: 'CREATE',
      entityType: ENTITY,
      entityId: record.id,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      after: record,
      metadata: { consumedSession: consumed },
    },
    tx,
  );
  return record;
}

export const attendanceService = {
  /** تسجيل حضور فردى (يدوي/QR/باركود/خارجي). */
  async record(input: RecordAttendanceInput, meta: Meta): Promise<AttendanceRecord> {
    return prisma.$transaction(async (tx) => {
      const session = await prepareSession(input.sessionId, tx);
      const settings = await getAttendanceSettings(tx);
      return createRecord(tx, session, { ...input, status: input.status }, settings, meta);
    });
  },

  /**
   * تعديل سجل موجود — داخل نافذة التعديل (نهاية الحصة + attendance.edit_window_minutes)
   * وإلا يتطلب صلاحية attendance.edit_past + Audit. يعكس استهلاك الحصص عند التصحيح.
   */
  async update(input: UpdateAttendanceInput, meta: Meta): Promise<AttendanceRecord> {
    return prisma.$transaction(async (tx) => {
      const current = await attendanceRepository.findById(input.id, tx);
      if (!current) throw notFound('سجل الحضور');
      const session = await prepareSession(current.sessionId, tx);
      const settings = await getAttendanceSettings(tx);

      const outsideWindow = isOutsideEditWindow(session.endTime, new Date(), settings.editWindowMinutes);
      let pastEditPermitted = false;
      if (outsideWindow) {
        pastEditPermitted = await hasPermission(meta.user, EDIT_PAST_PERMISSION);
        if (!pastEditPermitted) {
          throw forbidden('انتهت نافذة تعديل الحضور — يتطلب صلاحية تعديل السجلات السابقة');
        }
      }

      const status = (input.status ?? current.status) as AttendanceStatusValue;
      const minutesLate =
        status === 'LATE' ? (input.minutesLate ?? current.minutesLate) : 0;

      // عكس/تطبيق استهلاك اشتراك الحصص عند التصحيح
      let consumedSession = current.consumedSession;
      const wasAttended = isAttendedStatus(current.status as AttendanceStatusValue);
      const nowAttended = isAttendedStatus(status);
      if (!wasAttended && nowAttended && !consumedSession) {
        consumedSession = await consumeSessionQuota(tx, current.athleteId, session.sessionDate);
      } else if (wasAttended && !nowAttended && consumedSession) {
        await reverseSessionQuota(tx, current.athleteId, session.sessionDate);
        consumedSession = false;
      }

      const updated = await attendanceRepository.update(
        current.id,
        {
          status,
          minutesLate,
          consumedSession,
          notes: input.notes === undefined ? undefined : input.notes,
        },
        tx,
      );

      if (status === 'ABSENT') await maybeAlertConsecutiveAbsence(tx, current.athleteId, settings);
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: current.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: current,
          after: updated,
          metadata: { pastWindowEdit: outsideWindow, pastEditPermitted },
        },
        tx,
      );
      return updated;
    });
  },

  /**
   * تسجيل جماعي: تحديد الكل حاضرًا ثم تعديل حالات فردية (entries).
   * السجلات المكررة (P2002) تُتخطى وتُدرج في skipped.
   */
  async bulk(
    input: BulkAttendanceInput,
    meta: Meta,
  ): Promise<{ created: number; updated: number; skipped: Array<{ athleteId: string; reason: string }> }> {
    return prisma.$transaction(async (tx) => {
      const session = await prepareSession(input.sessionId, tx);
      const settings = await getAttendanceSettings(tx);
      const skipped: Array<{ athleteId: string; reason: string }> = [];
      let created = 0;
      let updated = 0;

      const applyEntry = async (entry: BulkAttendanceEntry): Promise<void> => {
        const existing = await attendanceRepository.findForAthleteSession(entry.athleteId, session.id, tx);
        if (existing) {
          // تعديل السجل الموجود بدل إنشاء مكرر
          const status = (entry.status ?? existing.status) as AttendanceStatusValue;
          const minutesLate = status === 'LATE' ? (entry.minutesLate ?? existing.minutesLate) : 0;
          let consumedSession = existing.consumedSession;
          const wasAttended = isAttendedStatus(existing.status as AttendanceStatusValue);
          const nowAttended = isAttendedStatus(status);
          if (!wasAttended && nowAttended && !consumedSession) {
            consumedSession = await consumeSessionQuota(tx, existing.athleteId, session.sessionDate);
          } else if (wasAttended && !nowAttended && consumedSession) {
            await reverseSessionQuota(tx, existing.athleteId, session.sessionDate);
            consumedSession = false;
          }
          await attendanceRepository.update(
            existing.id,
            { status, minutesLate, consumedSession, notes: entry.notes === undefined ? undefined : entry.notes },
            tx,
          );
          if (status === 'ABSENT') await maybeAlertConsecutiveAbsence(tx, existing.athleteId, settings);
          updated++;
          return;
        }
        try {
          await createRecord(
            tx,
            session,
            {
              athleteId: entry.athleteId,
              status: entry.status,
              method: input.method,
              recordedAt: input.recordedAt,
              minutesLate: entry.minutesLate,
              notes: entry.notes,
            },
            settings,
            meta,
          );
          created++;
        } catch (e) {
          if (e instanceof AppError && e.code === ErrorCode.CONFLICT) {
            skipped.push({ athleteId: entry.athleteId, reason: e.message });
            return;
          }
          if (e instanceof AppError && e.code === ErrorCode.BUSINESS_RULE) {
            skipped.push({ athleteId: entry.athleteId, reason: e.message });
            return;
          }
          throw e;
        }
      };

      if (input.markAllPresent) {
        const members = await attendanceRepository.listActiveMembers(session.groupId, tx);
        const already = new Set(
          (await attendanceRepository.listBySession(session.id, tx)).map((r) => r.athleteId),
        );
        for (const member of members) {
          if (already.has(member.athleteId)) {
            skipped.push({ athleteId: member.athleteId, reason: 'سجل موجود مسبقًا' });
            continue;
          }
          await applyEntry({ athleteId: member.athleteId, status: 'PRESENT' });
        }
      }

      for (const entry of input.entries) {
        await applyEntry(entry);
      }

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: ENTITY,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: {
            operation: 'bulk',
            sessionId: session.id,
            markAllPresent: input.markAllPresent,
            created,
            updated,
            skipped,
          },
        },
        tx,
      );
      return { created, updated, skipped };
    });
  },

  /** ورقة الحضور لمجموعة/فترة (مع تطبيق نطاق المدرب). */
  async sheet(
    query: AttendanceListQuery,
    user: AuthContext,
  ): Promise<{ items: SheetRecordRow[]; total: number }> {
    const scope = toScoped(user);
    if (isScopeRestricted(scope)) {
      const groupIds = await coachGroupIds(scope.linkedCoachId as string);
      return attendanceRepository.sheet(query, groupIds);
    }
    return attendanceRepository.sheet(query);
  },

  /** بيانات ورقة الحضور الكاملة: أعضاء المجموعة + حصص الفترة + السجلات. */
  async sheetData(
    query: AttendanceListQuery & { groupId: string },
    user: AuthContext,
  ): Promise<{
    members: Awaited<ReturnType<typeof attendanceRepository.listActiveMembers>>;
    sessions: Awaited<ReturnType<typeof attendanceRepository.listGroupSessions>>;
    records: SheetRecordRow[];
  }> {
    const scope = toScoped(user);
    if (isScopeRestricted(scope)) {
      const groupIds = await coachGroupIds(scope.linkedCoachId as string);
      if (!groupIds.includes(query.groupId)) throw notFound('المجموعة');
    }
    const app = await getSettings();
    const from = query.from ? parseDateOnly(query.from) : parseDateOnly(todayIn(app.timezone));
    const to = query.to ? parseDateOnly(query.to) : from;
    const [members, sessions] = await Promise.all([
      attendanceRepository.listActiveMembers(query.groupId),
      attendanceRepository.listGroupSessions(query.groupId, from, to),
    ]);
    const result = await attendanceRepository.sheet(
      { ...query, page: 1, pageSize: 100, sort: undefined, q: undefined },
      isScopeRestricted(scope) ? [query.groupId] : undefined,
    );
    return { members, sessions, records: result.items };
  },
};
