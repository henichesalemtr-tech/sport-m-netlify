/**
 * توليد أرقام التسجيل — منطق نقية قابل للاختبار دون قاعدة بيانات.
 * الصيغة قابلة للضبط عبر Settings (athletes.registrationFormat).
 * الرموز المدعومة: {YYYY} {YY} {MM} {SPORT} {SEQ} {SEQ:n}
 * مثال افتراضي: ATH-{YYYY}-{SEQ:5} → ATH-2026-00001
 */

const TOKEN_RE = /\{(YYYY|YY|MM|SPORT|SEQ(?::(\d+))?)\}/g;

export interface RegistrationContext {
  year: number;
  month: number; // 1-12
  sequence: number; // ≥ 1
  sportCode?: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isValidRegistrationFormat(format: string): boolean {
  if (format.trim().length === 0 || format.length > 60) return false;
  // يجب أن تحتوي على رمز واحد على الأقل وألا تحتوي أقواسًا غير معروفة
  TOKEN_RE.lastIndex = 0;
  if (!TOKEN_RE.test(format)) return false;
  const stripped = format.replace(TOKEN_RE, '');
  return !/[{}]/.test(stripped);
}

/** بناء رقم التسجيل من الصيغة والسياق. ترمي Error عند صيغة/سياق غير صالح. */
export function generateRegistrationNumber(format: string, ctx: RegistrationContext): string {
  if (!isValidRegistrationFormat(format)) {
    throw new Error(`صيغة رقم التسجيل غير صالحة: ${format}`);
  }
  if (!Number.isInteger(ctx.year) || ctx.year < 1900 || ctx.year > 9999) {
    throw new Error('سنة التسجيل غير صالحة');
  }
  if (!Number.isInteger(ctx.month) || ctx.month < 1 || ctx.month > 12) {
    throw new Error('شهر التسجيل غير صالح');
  }
  if (!Number.isInteger(ctx.sequence) || ctx.sequence < 1) {
    throw new Error('رقم التسلسل يجب أن يكون عددًا صحيحًا موجبًا');
  }

  return format.replace(TOKEN_RE, (match: string, token: string, widthRaw?: string): string => {
    // رمز SEQ قد يحمل لاحقة العرض (SEQ:5) — نفصل الاسم عن العرض.
    const name = token.startsWith('SEQ') ? 'SEQ' : token;
    switch (name) {
      case 'YYYY':
        return String(ctx.year).padStart(4, '0');
      case 'YY':
        return String(ctx.year % 100).padStart(2, '0');
      case 'MM':
        return String(ctx.month).padStart(2, '0');
      case 'SPORT':
        return ctx.sportCode ?? '';
      case 'SEQ': {
        const width = widthRaw === undefined ? 4 : Number(widthRaw);
        if (!Number.isInteger(width) || width < 1 || width > 12) {
          throw new Error('عرض رقم التسلسل يجب أن يكون بين 1 و12');
        }
        return String(ctx.sequence).padStart(width, '0');
      }
      default:
        return match;
    }
  });
}

/**
 * نمط Regex مطابق للصيغة مع مجموعة التقاط للتسلسل —
 * يُستخدم لاستخراج التسلسل من الأرقام الموجودة وحساب التالي.
 */
export function registrationNumberPattern(format: string): RegExp {
  let out = '';
  let last = 0;
  const re = new RegExp(TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(format)) !== null) {
    out += escapeRegExp(format.slice(last, m.index));
    const token = m[1];
    if (token?.startsWith('SEQ')) out += '(\\d+)';
    else if (token === 'YYYY') out += '\\d{4}';
    else if (token === 'YY') out += '\\d{2}';
    else if (token === 'MM') out += '\\d{2}';
    else out += '[A-Za-z0-9_-]*';
    last = m.index + m[0].length;
  }
  out += escapeRegExp(format.slice(last));
  return new RegExp(`^${out}$`);
}

/** هل الصيغة تحتوي رمز تسلسل؟ */
export function formatHasSequence(format: string): boolean {
  return /\{SEQ(?::\d+)?\}/.test(format);
}

/** استخراج التسلسل من رقم تسجيل موجود (أو null إن لم يطابق الصيغة). */
export function extractSequence(registrationNo: string, format: string): number | null {
  if (!formatHasSequence(format)) return null;
  const m = registrationNumberPattern(format).exec(registrationNo);
  const seq = m?.[1];
  if (seq === undefined) return null;
  const n = Number(seq);
  return Number.isFinite(n) ? n : null;
}

/** التسلسل التالي = أكبر تسلسل موجود + 1 (يبدأ من 1). */
export function nextSequence(existingNumbers: string[], format: string): number {
  let max = 0;
  for (const no of existingNumbers) {
    const s = extractSequence(no, format);
    if (s !== null && s > max) max = s;
  }
  return max + 1;
}
