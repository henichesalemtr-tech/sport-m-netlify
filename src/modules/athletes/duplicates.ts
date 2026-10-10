/**
 * كشف الرياضيين المكررين — منطق نقية قابلة للاختبار دون قاعدة بيانات.
 * القاعدة: نفس الاسم (بعد التطبيع العربي) + (نفس تاريخ الميلاد أو هاتف ولي مشترك
 * أو هاتف الرياضي نفسه مشترك). النتيجة تحذير قابل للتجاوز عند الإنشاء.
 */
import { normalizeArabic } from '@/shared/text/normalize';

export type AthleteDuplicateReason = 'NAME_BIRTHDATE' | 'NAME_PARENT_PHONE' | 'NAME_PHONE';

export interface DuplicateCheckInput {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD أو ISO — يُقارن أول 10 أحرف فقط. */
  birthDate?: string | null;
  phone?: string | null;
  parentPhones?: (string | null | undefined)[];
}

export interface DuplicateCandidate {
  id: string;
  registrationNo: string;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  phone?: string | null;
  parentPhones?: (string | null | undefined)[];
}

export interface AthleteDuplicateMatch {
  athleteId: string;
  registrationNo: string;
  fullName: string;
  reasons: AthleteDuplicateReason[];
  score: number;
}

/**
 * تطبيع الهاتف (سياق الجزائر): إزالة كل ما ليس رقمًا،
 * وتحويل الصيغ الدولية (+213 / 00213 / 213…) إلى الصيغة المحلية ابتداءً من 0.
 */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00213')) digits = `0${digits.slice(5)}`;
  else if (digits.startsWith('213') && digits.length >= 12) digits = `0${digits.slice(3)}`;
  return digits;
}

export function fullNameKey(firstName: string, lastName: string): string {
  return `${normalizeArabic(firstName)} ${normalizeArabic(lastName)}`;
}

export function dateKey(value?: string | null): string | null {
  if (!value) return null;
  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function phoneSet(phones: (string | null | undefined)[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const p of phones ?? []) {
    if (!p) continue;
    const n = normalizePhone(p);
    if (n.length >= 6) set.add(n);
  }
  return set;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) if (b.has(v)) return true;
  return false;
}

/** كشف التطابقات بين مدخل مرشح وقائمة مرشحين (الاسم شرط لازم في كل القواعد). */
export function detectAthleteDuplicates(
  input: DuplicateCheckInput,
  candidates: DuplicateCandidate[],
): AthleteDuplicateMatch[] {
  const nameKey = fullNameKey(input.firstName, input.lastName);
  const inputBirth = dateKey(input.birthDate);
  const inputParentPhones = phoneSet(input.parentPhones);
  const inputPhone = input.phone ? normalizePhone(input.phone) : null;

  const matches: AthleteDuplicateMatch[] = [];
  for (const c of candidates) {
    if (fullNameKey(c.firstName, c.lastName) !== nameKey) continue;

    const reasons: AthleteDuplicateReason[] = [];
    const cBirth = dateKey(c.birthDate);
    if (inputBirth && cBirth && inputBirth === cBirth) reasons.push('NAME_BIRTHDATE');
    if (intersects(inputParentPhones, phoneSet(c.parentPhones))) reasons.push('NAME_PARENT_PHONE');
    const cPhone = c.phone ? normalizePhone(c.phone) : null;
    if (inputPhone && inputPhone.length >= 6 && cPhone && inputPhone === cPhone) {
      reasons.push('NAME_PHONE');
    }

    if (reasons.length > 0) {
      matches.push({
        athleteId: c.id,
        registrationNo: c.registrationNo,
        fullName: `${c.firstName} ${c.lastName}`,
        reasons,
        score: reasons.length,
      });
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}
