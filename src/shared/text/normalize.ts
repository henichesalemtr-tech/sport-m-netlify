/**
 * تطبيع النص العربي للبحث (7.5): توحيد الألف/الياء/التاء المربوطة،
 * إزالة التشكيل والتطويل، وبحث لا يتأثر بحالة الأحرف اللاتينية.
 */

const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

const REPLACEMENTS: Record<string, string> = {
  '\u0622': '\u0627', // آ
  '\u0623': '\u0627', // أ
  '\u0625': '\u0627', // إ
  '\u0627': '\u0627', // ا
  '\u0649': '\u064a', // ى → ي
  '\u0629': '\u0647', // ة → ه
};

export function normalizeArabic(input: string): string {
  let out = input.replace(DIACRITICS, '').replace(TATWEEL, '');
  out = Array.from(out)
    .map((ch) => REPLACEMENTS[ch] ?? ch)
    .join('');
  return out.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** نمط Regex متسامح للاستخدام مع LIKE/contains بعد التطبيع. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}
