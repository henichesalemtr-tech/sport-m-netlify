import { Prisma } from '@prisma/client';

/**
 * منطق التكرار والتعارض النقي (قابل للاختبار دون قاعدة بيانات) — 7.7.
 * النطاق الزمني نصف مفتوح [start, end) — مطابق لقيد EXCLUDE في raw-constraints.sql.
 */

export const WEEKDAY_INDEX: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

export type WeekdayCode = keyof typeof WEEKDAY_INDEX;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * توليد تواريخ الحصص المتكررة داخل نافذة [from, to] (شاملة)
 * حسب أيام الأسبوع. التواريخ UTC-midnight وتُعاد ISO (YYYY-MM-DD).
 */
export function generateRecurringDates(opts: {
  days: readonly string[];
  from: Date;
  to: Date;
}): string[] {
  const dayNums = new Set(
    opts.days.map((d) => WEEKDAY_INDEX[d.toUpperCase()]).filter((n): n is number => n !== undefined),
  );
  const out: string[] = [];
  if (dayNums.size === 0) return out;
  const cursor = new Date(Date.UTC(opts.from.getUTCFullYear(), opts.from.getUTCMonth(), opts.from.getUTCDate()));
  const end = Date.UTC(opts.to.getUTCFullYear(), opts.to.getUTCMonth(), opts.to.getUTCDate());
  // حماية من نافذة غير صالحة/كبيرة جدًا (حد أقصى 400 يوم)
  let guard = 0;
  while (cursor.getTime() <= end && guard < 400) {
    if (dayNums.has(cursor.getUTCDay())) out.push(toISODate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard++;
  }
  return out;
}

/** هل يتقاطع نطاقان نصف مفتوحين [aStart, aEnd) و [bStart, bEnd)؟ */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type ConflictResource = 'coach' | 'venue' | 'group';

export interface SessionCandidate {
  coachId: string | null;
  venueId: string | null;
  groupId: string | null;
  startTime: Date;
  endTime: Date;
  /** معرفات تُستثنى من الفحص (مثل حصص السلسلة نفسها عند تعديلها). */
  excludeIds?: string[];
}

export interface ExistingSessionSlot {
  id: string;
  title: string;
  coachId: string | null;
  venueId: string | null;
  groupId: string | null;
  startTime: Date;
  endTime: Date;
}

export interface SessionConflict {
  resource: ConflictResource;
  resourceId: string;
  sessionId: string;
  sessionTitle: string;
  startTime: Date;
  endTime: Date;
}

/** كشف التعارضات مسبقًا (Pre-check) — الحماية النهائية تبقى قيد EXCLUDE في DB. */
export function findSessionConflicts(
  candidate: SessionCandidate,
  existing: ExistingSessionSlot[],
): SessionConflict[] {
  const excluded = new Set(candidate.excludeIds ?? []);
  const conflicts: SessionConflict[] = [];
  for (const s of existing) {
    if (excluded.has(s.id)) continue;
    if (!rangesOverlap(candidate.startTime, candidate.endTime, s.startTime, s.endTime)) continue;
    if (candidate.coachId !== null && s.coachId === candidate.coachId) {
      conflicts.push({ resource: 'coach', resourceId: s.coachId, sessionId: s.id, sessionTitle: s.title, startTime: s.startTime, endTime: s.endTime });
    }
    if (candidate.venueId !== null && s.venueId === candidate.venueId) {
      conflicts.push({ resource: 'venue', resourceId: s.venueId, sessionId: s.id, sessionTitle: s.title, startTime: s.startTime, endTime: s.endTime });
    }
    if (candidate.groupId !== null && s.groupId === candidate.groupId) {
      conflicts.push({ resource: 'group', resourceId: s.groupId, sessionId: s.id, sessionTitle: s.title, startTime: s.startTime, endTime: s.endTime });
    }
  }
  return conflicts;
}

const RESOURCE_AR: Record<ConflictResource, string> = {
  coach: 'المدرب',
  venue: 'القاعة/الملعب',
  group: 'المجموعة',
};

/** رسالة تعارض عربية تُسمّي المورد والحدث المتعارض معه. */
export function describeConflict(c: SessionConflict): string {
  return `تعارض في ${RESOURCE_AR[c.resource]} مع الحصة "${c.sessionTitle}" (${c.sessionId})`;
}

/**
 * دمج تاريخ "YYYY-MM-DD" مع وقت "HH:mm" في منطقة المؤسسة الزمنية → UTC Date.
 * (تعويض إزاحة المنطقة يُحسب عبر Intl — تكرار ثانٍ لضبط حدود DST).
 */
export function zonedTimeToUtc(dateISO: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number) as [number, number, number];
  const [hh, mm] = hhmm.split(':').map(Number) as [number, number];
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset1 = tzOffsetMinutes(guess, timeZone);
  const attempt = new Date(guess.getTime() - offset1 * 60_000);
  const offset2 = tzOffsetMinutes(attempt, timeZone);
  return offset1 === offset2 ? attempt : new Date(guess.getTime() - offset2 * 60_000);
}

function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUTC - instant.getTime()) / 60_000);
}

/** هل الخطأ انتهاك قيد EXCLUDE (Postgres 23P01) — عبر Prisma P2010 أو الخطأ الخام؟ */
export function isExclusionViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2010') {
    const meta: unknown = e.meta;
    const hay = typeof meta === 'string' ? meta : JSON.stringify(meta ?? '');
    return hay.includes('23P01') || e.message.includes('23P01');
  }
  if (typeof e === 'object' && e !== null && 'code' in e) {
    return (e as { code: unknown }).code === '23P01';
  }
  return false;
}
