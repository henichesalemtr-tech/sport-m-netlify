/**
 * سياسة الاحتفاظ بالنسخ الاحتياطية (GFS) — دوال نقية قابلة للاختبار:
 * يومي: آخر 7 أيام، أسبوعي: آخر 4 أسابيع، شهري: آخر 6 أشهر.
 * أي نسخة لا تقع ضمن سلال الاحتفاظ تُحدَّد للحذف.
 */

export const RETENTION_POLICY = {
  daily: 7,
  weekly: 4,
  monthly: 6,
} as const;

export interface BackupMeta {
  id: string;
  createdAt: Date;
  kind: string; // manual|daily|weekly|monthly|pre-restore
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** رقم أسبوع ثابت (أسابيع كاملة منذ epoch) — كافٍ لسلال الاحتفاظ الأسبوعية. */
function weekKey(d: Date): string {
  return `W${Math.floor(d.getTime() / (7 * 86_400_000))}`;
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/**
 * يحدّد معرّفات النسخ التي تجاوزت سياسة الاحتفاظ.
 * الخوارزمية (GFS): النسخ مرتبة من الأحدث؛ كل نسخة تحجز سلة يومها إن كانت
 * السلال اليومية (<7) غير ممتلئة، وإلا سلة أسبوعها (<4)، وإلا سلة شهرها (<6).
 * ما لم يحجز أي سلة يُعتبر منتهيًا.
 */
export function selectExpiredBackups(
  backups: BackupMeta[],
  now: Date = new Date(),
  policy: { daily: number; weekly: number; monthly: number } = RETENTION_POLICY,
): string[] {
  const sorted = [...backups].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const keptDays = new Set<string>();
  const keptWeeks = new Set<string>();
  const keptMonths = new Set<string>();
  const keepIds = new Set<string>();

  for (const b of sorted) {
    // نسخة "مستقبلية" (ساعة نظام غير مضبوطة) — لا تُحذف أبدًا
    if (b.createdAt.getTime() > now.getTime()) {
      keepIds.add(b.id);
      continue;
    }
    const dk = dayKey(b.createdAt);
    const wk = weekKey(b.createdAt);
    const mk = monthKey(b.createdAt);

    if (!keptDays.has(dk) && keptDays.size < policy.daily) {
      keptDays.add(dk);
      keepIds.add(b.id);
    } else if (!keptWeeks.has(wk) && keptWeeks.size < policy.weekly) {
      keptWeeks.add(wk);
      keepIds.add(b.id);
    } else if (!keptMonths.has(mk) && keptMonths.size < policy.monthly) {
      keptMonths.add(mk);
      keepIds.add(b.id);
    }
  }

  return sorted.filter((b) => !keepIds.has(b.id)).map((b) => b.id);
}

/** نوع النسخة المجدولة حسب تاريخ الإنشاء: شهري (أول الشهر) ← أسبوعي (السبت) ← يومي. */
export function scheduledKind(date: Date): 'daily' | 'weekly' | 'monthly' {
  const day = date.getUTCDate();
  const weekday = date.getUTCDay();
  if (day === 1) return 'monthly';
  if (weekday === 6) return 'weekly'; // السبت — بداية الأسبوع في المنطقة العربية
  return 'daily';
}
