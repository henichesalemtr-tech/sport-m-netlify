/**
 * كشف الأولياء المكررين — منطق نقية قابلة للاختبار دون قاعدة بيانات.
 * القاعدة: تطابق الهاتف (أو الهاتف الثانوي) بعد التطبيع.
 */
import { normalizePhone } from '@/modules/athletes/duplicates';

export type ParentDuplicateReason = 'PHONE' | 'PHONE2' | 'PHONE_MATCHES_PHONE2' | 'PHONE2_MATCHES_PHONE';

export interface ParentDuplicateInput {
  phone: string;
  phone2?: string | null;
}

export interface ParentDuplicateCandidate {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  phone2?: string | null;
}

export interface ParentDuplicateMatch {
  parentId: string;
  fullName: string;
  reasons: ParentDuplicateReason[];
  score: number;
}

function norm(value?: string | null): string | null {
  if (!value) return null;
  const n = normalizePhone(value);
  return n.length >= 6 ? n : null;
}

/** كشف الأولياء المكررين بتطابق الهواتف (كل الاتجاهات الأربعة). */
export function detectDuplicateParents(
  input: ParentDuplicateInput,
  candidates: ParentDuplicateCandidate[],
): ParentDuplicateMatch[] {
  const phone = norm(input.phone);
  const phone2 = norm(input.phone2);

  const matches: ParentDuplicateMatch[] = [];
  for (const c of candidates) {
    const cPhone = norm(c.phone);
    const cPhone2 = norm(c.phone2);
    const reasons: ParentDuplicateReason[] = [];
    if (phone && cPhone && phone === cPhone) reasons.push('PHONE');
    if (phone && cPhone2 && phone === cPhone2) reasons.push('PHONE_MATCHES_PHONE2');
    if (phone2 && cPhone && phone2 === cPhone) reasons.push('PHONE2_MATCHES_PHONE');
    if (phone2 && cPhone2 && phone2 === cPhone2) reasons.push('PHONE2');
    if (reasons.length > 0) {
      matches.push({
        parentId: c.id,
        fullName: `${c.firstName} ${c.lastName}`,
        reasons,
        score: reasons.length,
      });
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}
