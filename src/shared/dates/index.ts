/**
 * التواريخ والمناطق الزمنية (4.4).
 * الطوابع الزمنية UTC، التواريخ التجارية DATE، و"اليوم" يُحسن بمنطقة المؤسسة.
 */

/** "اليوم" كتاريخ YYYY-MM-DD في منطقة المؤسسة (وليس جهاز المستخدم). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now);
}

export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** حساب العمر من تاريخ الميلاد حتى تاريخ مرجعي (اليوم أو بداية الموسم). */
export function calcAge(birthDate: Date | string, reference: Date = new Date()): number {
  const b = typeof birthDate === 'string' ? parseDateOnly(birthDate) : birthDate;
  let age = reference.getUTCFullYear() - b.getUTCFullYear();
  const m = reference.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && reference.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/** إضافة أيام لتاريخ (لحساب نهاية الاشتراك). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function diffInDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / 86_400_000);
}

/** بداية/نهاية فترة (يوم/أسبوع/شهر/سنة) بمنطقة المؤسسة — 8.1 */
export type PeriodKey = 'day' | 'week' | 'month' | 'year';

export function periodRange(
  period: PeriodKey,
  timeZone: string,
  reference: Date = new Date(),
): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(reference);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = Number(get('year'));
  const mo = Number(get('month'));
  const da = Number(get('day'));
  const baseUtc = Date.UTC(y, mo - 1, da);

  switch (period) {
    case 'day':
      return { start: new Date(baseUtc), end: new Date(baseUtc + 86_400_000 - 1) };
    case 'week': {
      const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const wd = weekdayMap[get('weekday')] ?? 0;
      const start = baseUtc - wd * 86_400_000;
      return { start: new Date(start), end: new Date(start + 7 * 86_400_000 - 1) };
    }
    case 'month': {
      const start = Date.UTC(y, mo - 1, 1);
      const end = Date.UTC(y, mo, 1);
      return { start: new Date(start), end: new Date(end - 1) };
    }
    case 'year': {
      const start = Date.UTC(y, 0, 1);
      const end = Date.UTC(y + 1, 0, 1);
      return { start: new Date(start), end: new Date(end - 1) };
    }
  }
}

/** السنة المالية حسب شهر بدايتها المضبوط في Settings. */
export function fiscalYear(date: Date, fiscalStartMonth: number, timeZone: string): number {
  const y = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(date),
  );
  const m = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone, month: '2-digit' }).format(date),
  );
  return m >= fiscalStartMonth ? y : y - 1;
}

export function formatDate(value: Date | string, locale: string, timeZone: string): string {
  const d = typeof value === 'string' ? parseDateOnly(value) : value;
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium' }).format(d);
}

export function formatDateTime(value: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

/** عدد دقائق التأخر مقارنة بوقت البداية وحد التأخر المسموح. */
export function lateMinutes(startTime: Date, actualTime: Date): number {
  const diff = Math.floor((actualTime.getTime() - startTime.getTime()) / 60_000);
  return diff > 0 ? diff : 0;
}
