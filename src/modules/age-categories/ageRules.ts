/**
 * منطق الفئات العمرية النقي (قابل للاختبار دون قاعدة بيانات):
 * - لا تداخل بين الفئات.
 * - لا فجوات بين الفئات المتجاورة.
 * - الفئة العليا (أكابر) مفتوحة: maxAge = null.
 * الأعمار أعداد صحيحة والفئة تغطي [minAge, maxAge] شاملة الطرفين.
 */

export interface CategoryRange {
  id: string;
  name: string;
  minAge: number | null;
  maxAge: number | null;
}

export interface OverlapIssue {
  firstId: string;
  firstName: string;
  secondId: string;
  secondName: string;
}

export interface GapIssue {
  /** أول عمر غير مغطى */
  fromAge: number;
  /** آخر عمر غير مغطى — Infinity تُرجع كـ null في التفاصيل */
  toAge: number | null;
  afterCategoryName: string;
  beforeCategoryName: string | null;
}

export interface ContinuityResult {
  valid: boolean;
  overlaps: OverlapIssue[];
  gaps: GapIssue[];
}

export function isSenior(c: CategoryRange): boolean {
  return c.maxAge === null;
}

export function effectiveMin(c: CategoryRange): number {
  return c.minAge ?? 0;
}

function finiteRanges(list: CategoryRange[]): CategoryRange[] {
  return list.filter((c) => !isSenior(c));
}

/** كشف كل أزواج الفئات المتداخلة. */
export function findOverlaps(list: CategoryRange[]): OverlapIssue[] {
  const issues: OverlapIssue[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i] as CategoryRange;
      const b = list[j] as CategoryRange;
      const aMin = effectiveMin(a);
      const bMin = effectiveMin(b);
      // الأكابر: [min, ∞) — أي تقاطع مع فئة أخرى يبدأ من الأعلى
      const overlaps =
        isSenior(a) && isSenior(b)
          ? true
          : isSenior(a)
            ? (b.maxAge as number) >= aMin
            : isSenior(b)
              ? (a.maxAge as number) >= bMin
              : aMin <= (b.maxAge as number) && bMin <= (a.maxAge as number);
      if (overlaps) {
        issues.push({ firstId: a.id, firstName: a.name, secondId: b.id, secondName: b.name });
      }
    }
  }
  return issues;
}

/** كشف الفجوات بين الفئات مرتبةً حسب minAge (بما فيها الفجوة قبل فئة الأكابر). */
export function findGaps(list: CategoryRange[]): GapIssue[] {
  const gaps: GapIssue[] = [];
  const sorted = [...list].sort((a, b) => effectiveMin(a) - effectiveMin(b));
  const finite = finiteRanges(sorted);
  const senior = sorted.find(isSenior);

  for (let i = 0; i < finite.length - 1; i++) {
    const current = finite[i] as CategoryRange;
    const next = finite[i + 1] as CategoryRange;
    const from = (current.maxAge as number) + 1;
    const to = effectiveMin(next) - 1;
    if (to >= from) {
      gaps.push({ fromAge: from, toAge: to, afterCategoryName: current.name, beforeCategoryName: next.name });
    }
  }

  if (senior && finite.length > 0) {
    const last = finite[finite.length - 1] as CategoryRange;
    const from = (last.maxAge as number) + 1;
    if (effectiveMin(senior) > from) {
      gaps.push({
        fromAge: from,
        toAge: effectiveMin(senior) - 1,
        afterCategoryName: last.name,
        beforeCategoryName: senior.name,
      });
    }
  }

  return gaps;
}

/** التحقق الكامل لقائمة فئات (تُستخدم عند الحفظ: القائمة الحالية + المرشحة). */
export function validateCategories(list: CategoryRange[]): ContinuityResult {
  const overlaps = findOverlaps(list);
  const gaps = findGaps(list);
  return { valid: overlaps.length === 0 && gaps.length === 0, overlaps, gaps };
}

/** اختيار الفئة المناسبة لعمر معيّن (أو null إن لم تغطه أي فئة). */
export function suggestCategoryForAge(age: number, list: CategoryRange[]): CategoryRange | null {
  const active = [...list].sort((a, b) => effectiveMin(a) - effectiveMin(b));
  for (const c of active) {
    if (isSenior(c)) {
      if (age >= effectiveMin(c)) return c;
      continue;
    }
    if (age >= effectiveMin(c) && age <= (c.maxAge as number)) return c;
  }
  return null;
}

/**
 * التاريخ المرجعي لحساب العمر: اليوم أو بداية الموسم (أقرب بداية موسم سابقة/حالية).
 * seasonStartMonth شهر 1-12 وبداية الموسم هي اليوم الأول من الشهر.
 */
export function seasonReferenceDate(
  now: Date,
  seasonStartMonth: number,
): Date {
  const y = now.getUTCFullYear();
  const month = Math.min(12, Math.max(1, seasonStartMonth));
  const thisYearStart = new Date(Date.UTC(y, month - 1, 1));
  if (now.getTime() >= thisYearStart.getTime()) return thisYearStart;
  return new Date(Date.UTC(y - 1, month - 1, 1));
}
