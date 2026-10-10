import { randomUUID } from 'node:crypto';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, businessRule, notFound } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import type { AuthContext } from '@/shared/permissions/guard';
import { isScopeRestricted, toScoped } from '@/shared/permissions/scope';
import { addDays, parseDateOnly } from '@/shared/dates';
import { appTimeZone, getSessionsGenerateAheadDays } from '@/shared/config/settings';
import { groupRepository } from '@/modules/groups/repository';
import { parseTrainingDays } from '@/modules/groups/capacityRules';
import { sessionRepository, type SessionWithDetails } from './repository';
import {
  describeConflict,
  findSessionConflicts,
  generateRecurringDates,
  isExclusionViolation,
  zonedTimeToUtc,
  type ExistingSessionSlot,
  type SessionConflict,
} from './recurrence';
import type {
  CancelSessionInput,
  CreateSessionInput,
  GenerateSessionsInput,
  RescheduleSessionInput,
  SessionListQuery,
  UpdateSessionInput,
} from './schema';

const ENTITY = 'TrainingSession';

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

function sessionConflictError(conflicts: SessionConflict[], concurrent = false): AppError {
  const first = conflicts[0];
  const message = first
    ? describeConflict(first)
    : 'تعارض في الجدولة مع حصة أخرى (قيد الاستبعاد في قاعدة البيانات)';
  return new AppError(ErrorCode.SESSION_CONFLICT, concurrent ? `${message} — تعارض متزامن` : message, {
    details: { conflicts },
  });
}

/** بناء أوقات UTC من تاريخ + HH:mm بمنطقة المؤسسة الزمنية. */
function buildTimes(sessionDate: string, startTime: string, endTime: string): { start: Date; end: Date } {
  const tz = appTimeZone();
  const start = zonedTimeToUtc(sessionDate, startTime, tz);
  const end = zonedTimeToUtc(sessionDate, endTime, tz);
  if (end.getTime() <= start.getTime()) {
    throw businessRule('وقت النهاية يجب أن يكون بعد وقت البداية');
  }
  return { start, end };
}

/** فحص مسبق للتعارضات (المصدر النهائي قيد EXCLUDE في PostgreSQL). */
async function assertNoConflicts(
  candidate: { coachId: string | null; venueId: string | null; groupId: string | null },
  start: Date,
  end: Date,
  excludeIds: string[],
  tx?: PrismaTransaction,
): Promise<void> {
  const existing: ExistingSessionSlot[] = await sessionRepository.findOverlapping(
    candidate,
    start,
    end,
    excludeIds,
    tx,
  );
  const conflicts = findSessionConflicts(
    { ...candidate, startTime: start, endTime: end, excludeIds: [] },
    existing,
  );
  if (conflicts.length > 0) throw sessionConflictError(conflicts);
}

/** إشعار "تغيّرت الحصة" مع dedupeKey (Idempotent) — 7.7. */
async function notifySessionChanged(
  tx: PrismaTransaction,
  session: { id: string; title: string; coachId: string | null },
  type: 'SESSION_RESCHEDULED' | 'SESSION_CANCELLED',
  dedupeKey: string,
  body: string,
): Promise<void> {
  const targetUser = session.coachId
    ? await tx.user.findFirst({
        where: { linkedCoachId: session.coachId, deletedAt: null },
        select: { id: true },
      })
    : null;
  await tx.notification.createMany({
    data: [
      {
        type,
        userId: targetUser?.id ?? null,
        roleTarget: targetUser ? null : 'RECEPTION',
        title: type === 'SESSION_CANCELLED' ? 'تم إلغاء حصة' : 'تم تغيير موعد حصة',
        body: `${session.title} — ${body}`,
        entityType: ENTITY,
        entityId: session.id,
        dedupeKey,
      },
    ],
    skipDuplicates: true,
  });
}

export const sessionService = {
  async list(
    query: SessionListQuery,
    user: AuthContext,
  ): Promise<{ items: SessionWithDetails[]; total: number }> {
    return sessionRepository.list(query, user);
  },

  async getById(id: string, user: AuthContext): Promise<SessionWithDetails> {
    const session = await sessionRepository.findById(id);
    if (!session) throw notFound('الحصة');
    // نطاق المدرب: حصصه أو حصص مجموعاته فقط
    const scope = toScoped(user);
    if (isScopeRestricted(scope)) {
      const coachId = scope.linkedCoachId as string;
      const group = session.groupId ? await groupRepository.findById(session.groupId) : null;
      if (session.coachId !== coachId && group?.coachId !== coachId) {
        throw notFound('الحصة');
      }
    }
    return session;
  },

  async create(input: CreateSessionInput, meta: Meta): Promise<SessionWithDetails> {
    const { start, end } = buildTimes(input.sessionDate, input.startTime, input.endTime);
    return prisma.$transaction(async (tx) => {
      await assertRelated(input, tx);

      // 1) فحص مسبق للتعارضات (مدرب/قاعة/مجموعة)
      await assertNoConflicts(
        {
          coachId: input.coachId ?? null,
          venueId: input.venueId ?? null,
          groupId: input.groupId ?? null,
        },
        start,
        end,
        [],
        tx,
      );

      // 2) الإدراج — الخط النهائي قيود EXCLUDE (23P01) في PostgreSQL
      let createdId: string;
      try {
        const created = await tx.trainingSession.create({
          data: {
            type: input.type,
            title: input.title,
            sportId: input.sportId ?? null,
            groupId: input.groupId ?? null,
            coachId: input.coachId ?? null,
            venueId: input.venueId ?? null,
            sessionDate: parseDateOnly(input.sessionDate),
            startTime: start,
            endTime: end,
            description: input.description ?? null,
            status: input.status ?? 'SCHEDULED',
            createdBy: meta.user.userId,
            updatedBy: meta.user.userId,
          },
        });
        createdId = created.id;
      } catch (e) {
        if (isExclusionViolation(e)) throw sessionConflictError([], true);
        throw e;
      }

      const after = await sessionRepository.findById(createdId, tx);
      if (!after) throw notFound('الحصة');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: ENTITY,
          entityId: createdId,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after,
        },
        tx,
      );
      return after;
    });
  },

  async update(id: string, input: UpdateSessionInput, meta: Meta): Promise<SessionWithDetails> {
    const { version, applyTo, ...data } = input;
    return prisma.$transaction(async (tx) => {
      const current = await sessionRepository.findById(id, tx);
      if (!current) throw notFound('الحصة');

      const nextDate = data.sessionDate ?? current.sessionDate.toISOString().slice(0, 10);
      const nextStartHM = data.startTime ?? toHHmm(current.startTime);
      const nextEndHM = data.endTime ?? toHHmm(current.endTime);
      const { start, end } = buildTimes(nextDate, nextStartHM, nextEndHM);
      const candidate = {
        coachId: data.coachId === undefined ? current.coachId : data.coachId,
        venueId: data.venueId === undefined ? current.venueId : data.venueId,
        groupId: data.groupId === undefined ? current.groupId : data.groupId,
      };
      await assertRelated({ ...candidate, sportId: data.sportId ?? current.sportId }, tx);

      if (applyTo === 'series') {
        if (!current.seriesId) {
          throw businessRule('هذه الحصة ليست جزءًا من سلسلة متكررة');
        }
        // تعديل السلسلة كلها (عدا الاستثناءات السابقة) — صف بصف للحفاظ على تواريخ كل حصة
        const series = await sessionRepository.findUpdatableSeriesSessions(current.seriesId, tx);
        const excludeIds = series.map((s) => s.id);
        const rows: SessionWithDetails[] = [];
        for (const s of series) {
          const row = await sessionRepository.findById(s.id, tx);
          if (!row) continue;
          rows.push(row);
        }
        for (const row of rows) {
          const rowDate = row.sessionDate.toISOString().slice(0, 10);
          const rowTimes = buildTimes(rowDate, nextStartHM, nextEndHM);
          await assertNoConflicts(candidate, rowTimes.start, rowTimes.end, excludeIds, tx);
        }
        let affected = 0;
        for (const row of rows) {
          const rowDate = row.sessionDate.toISOString().slice(0, 10);
          const rowTimes = buildTimes(rowDate, nextStartHM, nextEndHM);
          try {
            const r = await tx.trainingSession.updateMany({
              where: { id: row.id, deletedAt: null, status: 'SCHEDULED', isException: false },
              data: {
                title: data.title ?? undefined,
                type: data.type ?? undefined,
                sportId: data.sportId === undefined ? undefined : data.sportId,
                groupId: candidate.groupId,
                coachId: candidate.coachId,
                venueId: candidate.venueId,
                startTime: rowTimes.start,
                endTime: rowTimes.end,
                description: data.description === undefined ? undefined : data.description,
                updatedBy: meta.user.userId,
                version: { increment: 1 },
              },
            });
            affected += r.count;
          } catch (e) {
            if (isExclusionViolation(e)) throw sessionConflictError([], true);
            throw e;
          }
        }
        // تحقق التعديل المتزامن على الحصة الهدف في السلسلة
        const target = await tx.trainingSession.updateMany({
          where: { id, version },
          data: { updatedBy: meta.user.userId },
        });
        if (target.count === 0 && affected === 0) throw versionConflictError();
        await writeAudit(
          {
            userId: meta.user.userId,
            action: 'UPDATE',
            entityType: ENTITY,
            entityId: id,
            requestId: meta.requestId,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
            before: { seriesId: current.seriesId },
            after: data,
            metadata: { applyTo: 'series', affectedSessions: affected },
          },
          tx,
        );
        const after = await sessionRepository.findById(id, tx);
        if (!after) throw notFound('الحصة');
        return after;
      }

      // تعديل "هذه فقط" — تصبح استثناءً في سلسلتها
      await assertNoConflicts(candidate, start, end, [id], tx);
      let res: { count: number };
      try {
        res = await tx.trainingSession.updateMany({
          where: { id, version, deletedAt: null },
          data: {
            ...data,
            sessionDate: parseDateOnly(nextDate),
            startTime: start,
            endTime: end,
            isException: current.seriesId ? true : current.isException,
            updatedBy: meta.user.userId,
            version: { increment: 1 },
          },
        });
      } catch (e) {
        if (isExclusionViolation(e)) throw sessionConflictError([], true);
        throw e;
      }
      if (res.count === 0) throw versionConflictError();

      const after = await sessionRepository.findById(id, tx);
      if (!after) throw notFound('الحصة');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: current,
          after,
          metadata: { applyTo: 'this' },
        },
        tx,
      );
      return after;
    });
  },

  /** إعادة جدولة: تحديث الموعد + إشعار "تغيّرت الحصة" (dedupeKey). */
  async reschedule(id: string, input: RescheduleSessionInput, meta: Meta): Promise<SessionWithDetails> {
    const { start, end } = buildTimes(input.sessionDate, input.startTime, input.endTime);
    return prisma.$transaction(async (tx) => {
      const current = await sessionRepository.findById(id, tx);
      if (!current) throw notFound('الحصة');

      await assertNoConflicts(
        { coachId: current.coachId, venueId: current.venueId, groupId: current.groupId },
        start,
        end,
        [id],
        tx,
      );

      let res: { count: number };
      try {
        res = await tx.trainingSession.updateMany({
          where: { id, version: input.version, deletedAt: null },
          data: {
            sessionDate: parseDateOnly(input.sessionDate),
            startTime: start,
            endTime: end,
            status: 'SCHEDULED',
            isException: current.seriesId ? true : current.isException,
            updatedBy: meta.user.userId,
            version: { increment: 1 },
          },
        });
      } catch (e) {
        if (isExclusionViolation(e)) throw sessionConflictError([], true);
        throw e;
      }
      if (res.count === 0) throw versionConflictError();

      await notifySessionChanged(
        tx,
        current,
        'SESSION_RESCHEDULED',
        `session-rescheduled:${id}:${start.toISOString()}`,
        `الموعد الجديد ${input.sessionDate} ${input.startTime}-${input.endTime}${input.reason ? ` — السبب: ${input.reason}` : ''}`,
      );
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { sessionDate: current.sessionDate, startTime: current.startTime, endTime: current.endTime },
          after: { sessionDate: input.sessionDate, startTime: start, endTime: end },
          metadata: { operation: 'reschedule', reason: input.reason ?? null },
        },
        tx,
      );
      const after = await sessionRepository.findById(id, tx);
      if (!after) throw notFound('الحصة');
      return after;
    });
  },

  /** إلغاء + إشعار (dedupeKey) — الإلغاء لا يحذف سجلات الحضور. */
  async cancel(id: string, input: CancelSessionInput, meta: Meta): Promise<SessionWithDetails> {
    return prisma.$transaction(async (tx) => {
      const current = await sessionRepository.findById(id, tx);
      if (!current) throw notFound('الحصة');
      if (current.status === 'CANCELLED') {
        throw businessRule('الحصة ملغاة مسبقًا');
      }

      const res = await tx.trainingSession.updateMany({
        where: { id, version: input.version, deletedAt: null },
        data: {
          status: 'CANCELLED',
          updatedBy: meta.user.userId,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw versionConflictError();

      await notifySessionChanged(
        tx,
        current,
        'SESSION_CANCELLED',
        `session-cancelled:${id}:${input.version}`,
        `سبب الإلغاء: ${input.reason}`,
      );
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { status: current.status },
          after: { status: 'CANCELLED' },
          metadata: { operation: 'cancel', reason: input.reason },
        },
        tx,
      );
      const after = await sessionRepository.findById(id, tx);
      if (!after) throw notFound('الحصة');
      return after;
    });
  },

  /** حذف مرن — يُمنع إذا وُجدت سجلات حضور مرتبطة. */
  async remove(id: string, version: number, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await sessionRepository.findById(id, tx);
      if (!current) throw notFound('الحصة');

      const attendance = await sessionRepository.countAttendance(id, tx);
      if (attendance > 0) {
        throw businessRule('لا يمكن حذف حصة لها سجلات حضور — استخدم الإلغاء', { attendance });
      }

      const res = await tx.trainingSession.updateMany({
        where: { id, version, deletedAt: null },
        data: { deletedAt: new Date(), updatedBy: meta.user.userId, version: { increment: 1 } },
      });
      if (res.count === 0) throw versionConflictError();
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'DELETE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: current,
        },
        tx,
      );
      return { id };
    });
  },

  /**
   * توليد الحصص المتكررة من أيام/أوقات المجموعة ضمن نافذة متدحرجة
   (حدّها الأقصى sessions.generate_ahead_days من اليوم).
   * التواريخ التي لها حصص موجودة تُتخطى، والتعارضات تُتخطى مع تقرير.
   */
  async generate(
    input: GenerateSessionsInput,
    meta: Meta,
  ): Promise<{ seriesId: string; created: number; skipped: Array<{ date: string; reason: string }> }> {
    const aheadDays = await getSessionsGenerateAheadDays();
    const today = new Date();
    const fromDate = parseDateOnly(input.fromDate);
    const maxTo = addDays(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
      aheadDays,
    );
    const requestedTo = input.toDate ? parseDateOnly(input.toDate) : maxTo;
    const toDate = requestedTo.getTime() > maxTo.getTime() ? maxTo : requestedTo;
    if (fromDate.getTime() > toDate.getTime()) {
      throw businessRule(`نافذة التوليد تتجاوز الحد المسموح (${aheadDays} يومًا)`);
    }

    const seriesId = randomUUID();
    return prisma.$transaction(async (tx) => {
      const group = await groupRepository.findById(input.groupId, tx);
      if (!group) throw notFound('المجموعة');
      if (group.status !== 'ACTIVE') throw businessRule('لا يمكن توليد حصص لمجموعة معطلة');

      const days = parseTrainingDays(group.trainingDays);
      if (days.length === 0 || !group.startTime || !group.endTime) {
        throw businessRule('المجموعة بلا أيام تدريب أو أوقات محددة — اضبطها قبل التوليد');
      }

      const dates = generateRecurringDates({ days, from: fromDate, to: toDate });
      const skipped: Array<{ date: string; reason: string }> = [];
      if (dates.length === 0) {
        return { seriesId, created: 0, skipped };
      }

      // تخطي التواريخ التي لها حصص موجودة مسبقًا
      const existingDates = await sessionRepository.findGroupSessionsOnDates(
        group.id,
        dates.map((d) => parseDateOnly(d)),
        tx,
      );
      const existingISO = new Set(existingDates.map((s) => s.sessionDate.toISOString().slice(0, 10)));

      // فحص التعارضات دفعة واحدة على كامل النافذة
      const firstDate = dates[0] ?? input.fromDate;
      const lastDate = dates[dates.length - 1] ?? input.fromDate;
      const windowStart = zonedTimeToUtc(firstDate, group.startTime, appTimeZone());
      const windowEnd = zonedTimeToUtc(lastDate, group.endTime, appTimeZone());
      const overlapping = await sessionRepository.findOverlapping(
        { coachId: group.coachId, venueId: group.venueId, groupId: group.id },
        windowStart,
        addDays(windowEnd, 1),
        [],
        tx,
      );

      const rows: Array<{
        type: 'TRAINING';
        title: string;
        sportId: string;
        groupId: string;
        coachId: string | null;
        venueId: string | null;
        sessionDate: Date;
        startTime: Date;
        endTime: Date;
        seriesId: string;
        createdBy: string;
        updatedBy: string;
      }> = [];
      for (const dateISO of dates) {
        if (existingISO.has(dateISO)) {
          skipped.push({ date: dateISO, reason: 'EXISTING_SESSION' });
          continue;
        }
        const { start, end } = buildTimes(dateISO, group.startTime as string, group.endTime as string);
        const conflicts = findSessionConflicts(
          {
            coachId: group.coachId,
            venueId: group.venueId,
            groupId: group.id,
            startTime: start,
            endTime: end,
          },
          overlapping,
        );
        if (conflicts.length > 0) {
          skipped.push({ date: dateISO, reason: describeConflict(conflicts[0] as SessionConflict) });
          continue;
        }
        rows.push({
          type: 'TRAINING',
          title: `حصة ${group.name}`,
          sportId: group.sportId,
          groupId: group.id,
          coachId: group.coachId,
          venueId: group.venueId,
          sessionDate: parseDateOnly(dateISO),
          startTime: start,
          endTime: end,
          seriesId,
          createdBy: meta.user.userId,
          updatedBy: meta.user.userId,
        });
      }

      if (rows.length > 0) {
        try {
          await tx.trainingSession.createMany({ data: rows });
        } catch (e) {
          if (isExclusionViolation(e)) throw sessionConflictError([], true);
          throw e;
        }
      }

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: ENTITY,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: { seriesId, window: { fromDate, toDate }, created: rows.length },
          metadata: { operation: 'generate', groupId: group.id, skipped },
        },
        tx,
      );
      return { seriesId, created: rows.length, skipped };
    });
  },
};

/** HH:mm من طابع zoned في منطقة المؤسسة. */
function toHHmm(instant: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: appTimeZone(),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}

async function assertRelated(
  input: { sportId?: string | null; groupId?: string | null; coachId?: string | null; venueId?: string | null },
  tx: PrismaTransaction,
): Promise<void> {
  if (input.sportId) {
    const row = await tx.sport.findFirst({ where: { id: input.sportId, deletedAt: null }, select: { id: true } });
    if (!row) throw notFound('النشاط الرياضي');
  }
  if (input.groupId) {
    const row = await tx.group.findFirst({ where: { id: input.groupId, deletedAt: null }, select: { id: true } });
    if (!row) throw notFound('المجموعة');
  }
  if (input.coachId) {
    const row = await tx.coach.findFirst({ where: { id: input.coachId, deletedAt: null, isActive: true }, select: { id: true } });
    if (!row) throw notFound('المدرب');
  }
  if (input.venueId) {
    const row = await tx.venue.findFirst({ where: { id: input.venueId, deletedAt: null }, select: { id: true } });
    if (!row) throw notFound('القاعة/الملعب');
  }
}
