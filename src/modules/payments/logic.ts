/**
 * منطق المدفوعات النقي (7.11) — السلامة المالية قابلة للاختبار دون قاعدة بيانات.
 * المال BigInt بأصغر وحدة عبر @/shared/money (ممنوع float — 4.4).
 * مصدر حقيقة "المدفوع" هو الدفعات غير الملغاة، لا الحقل المحفوظ على الاشتراك.
 */
import { remaining, type MinorUnits } from '@/shared/money';

/** صافي الدفعة = المبلغ − خصم الدفعة (الخصم لا يتجاوز المبلغ). */
export function computePaymentNet(
  amount: MinorUnits,
  discount: MinorUnits,
): { discountAmount: MinorUnits; net: MinorUnits } {
  const discountAmount = discount > amount ? amount : discount;
  return { discountAmount, net: amount - discountAmount };
}

export interface PaymentEvaluationInput {
  /** صافي الاشتراك (price − خصم الاشتراك). */
  subscriptionNet: MinorUnits;
  /** مجموع صافي الدفعات غير الملغاة قبل هذه الدفعة. */
  paidNonVoided: MinorUnits;
  /** صافي الدفعة الجديدة. */
  paymentNet: MinorUnits;
  allowOverpay: boolean;
}

export interface PaymentEvaluation {
  remainingBefore: MinorUnits;
  remainingAfter: MinorUnits;
  isOverpay: boolean;
  /** false → يجب رمي OVERPAYMENT (الدفع الزائد مرفوض). */
  allowed: boolean;
}

/** تقييم الدفعة مقابل المتبقي: رفض الدفع الزائد إلا بإعداد payment.allowOverpay. */
export function evaluatePayment(input: PaymentEvaluationInput): PaymentEvaluation {
  const remainingBefore = remaining(input.subscriptionNet, input.paidNonVoided);
  const isOverpay = input.paymentNet > remainingBefore;
  return {
    remainingBefore,
    remainingAfter: remainingBefore - input.paymentNet,
    isOverpay,
    allowed: isOverpay ? input.allowOverpay : true,
  };
}

/** المجموع الجديد للمدفوع غير الملغى بعد إضافة دفعة. */
export function paidAfterNewPayment(paidNonVoided: MinorUnits, paymentNet: MinorUnits): MinorUnits {
  return paidNonVoided + paymentNet;
}

/** المجموع الجديد بعد إلغاء (VOID) دفعة — إعادة اشتقاق من الدفعات غير الملغاة. */
export function paidAfterVoid(paidNonVoided: MinorUnits, voidedNet: MinorUnits): MinorUnits {
  return paidNonVoided - voidedNet;
}

/** رقم الحركة: PAY-<السنة المالية>-<تسلسل 6 خانات>. */
export function nextTransactionNo(fiscalYear: number, sequence: number): string {
  return `PAY-${fiscalYear}-${String(sequence).padStart(6, '0')}`;
}

/** الاسترداد لا يتجاوز صافي الدفعة ناقص ما استُرد سابقًا. */
export function isValidRefund(
  netAmount: MinorUnits,
  alreadyRefunded: MinorUnits,
  requested: MinorUnits,
): boolean {
  return requested > 0n && alreadyRefunded + requested <= netAmount;
}
