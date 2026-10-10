/**
 * حسابات المال — أعداد صحيحة بأصغر وحدة (minor units) عبر BigInt.
 * ممنوع Float للمال (2.2 / 4.4).
 *
 * مثال: السعر 5000، الخصم 500، الصافي 4500، المدفوع 3000، المتبقي 1500.
 * عدد الخانات العشرية والعملة تُقرأ من Settings (currency.decimals, currency.code).
 */

export type MinorUnits = bigint;

/** تحويل مبلغ عشري (نص/رقم) إلى أصغر وحدة حسب عدد الخانات. */
export function toMinorUnits(amount: string | number, decimals: number): MinorUnits {
  const factor = 10n ** BigInt(decimals);
  const str = String(amount).trim();
  const neg = str.startsWith('-');
  const abs = neg ? str.slice(1) : str;
  const [intPart, fracPartRaw = ''] = abs.split('.');
  const fracPart = (fracPartRaw ?? '').padEnd(decimals, '0').slice(0, decimals);
  // التقريب لأقرب وحدة عند تجاوز الخانات
  const extra = (fracPartRaw ?? '').slice(decimals);
  let value = BigInt(intPart || '0') * factor + BigInt(fracPart || '0');
  if (extra.length > 0 && Number(extra[0]) >= 5) value += 1n;
  return neg ? -value : value;
}

/** تحويل من أصغر وحدة إلى عدد عشري (للعرض فقط). */
export function fromMinorUnits(minor: MinorUnits, decimals: number): number {
  const factor = 10n ** BigInt(decimals);
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(decimals, '0');
  const num = Number(`${intPart}.${fracPart}`);
  return neg ? -num : num;
}

/** تنسيق مبلغ للعرض وفق العملة وعدد الخانات ونوع الأرقام (Intl). */
export function formatMoney(
  minor: MinorUnits,
  opts: { decimals: number; currency: string; locale: string; numberingSystem?: string },
): string {
  const value = fromMinorUnits(minor, opts.decimals);
  const locale = opts.numberingSystem ? `${opts.locale}-u-nu-${opts.numberingSystem}` : opts.locale;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: opts.currency,
    minimumFractionDigits: opts.decimals,
    maximumFractionDigits: opts.decimals,
  }).format(value);
}

/**
 * حساب الخصم. قاعدة التقريب الموحدة: تُطبَّق مرة واحدة عند حساب نسبة الخصم
 * (تقريب لأسفل لأصغر وحدة — الخيار الأكثر أمانًا ماليًا).
 */
export function applyDiscount(
  price: MinorUnits,
  discount: { kind: 'FIXED' | 'PERCENT'; value: MinorUnits } | null,
): { discountAmount: MinorUnits; net: MinorUnits } {
  if (!discount || discount.value === 0n) {
    return { discountAmount: 0n, net: price };
  }
  let discountAmount: MinorUnits;
  if (discount.kind === 'FIXED') {
    discountAmount = discount.value;
  } else {
    // value مخزّنة كنسبة × 100 (مثال 1250 = 12.5%)
    discountAmount = (price * discount.value) / 10000n; // تقريب لأسفل
  }
  if (discountAmount > price) discountAmount = price; // الخصم لا يتجاوز السعر
  return { discountAmount, net: price - discountAmount };
}

/** المتبقي = الصافي − مجموع الدفعات غير الملغاة (مصدر الحقيقة الدفعات) — 7.11 */
export function remaining(netAmount: MinorUnits, paidNonVoided: MinorUnits): MinorUnits {
  return netAmount - paidNonVoided;
}

export function sumMinor(values: MinorUnits[]): MinorUnits {
  return values.reduce((a, b) => a + b, 0n);
}

export function assertPositive(minor: MinorUnits, label = 'المبلغ'): void {
  if (minor <= 0n) {
    throw new Error(`${label} يجب أن يكون أكبر من صفر`);
  }
}
