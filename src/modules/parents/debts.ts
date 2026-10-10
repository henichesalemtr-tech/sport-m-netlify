/**
 * حساب ديون الأولياء — منطق نقية قابلة للاختبار دون قاعدة بيانات.
 * المال BigInt بأصغر وحدة عبر دوال @/shared/money (ممنوع float — 4.4).
 * المتبقي لكل اشتراك = الصافي − مجموع الدفعات غير الملغاة (مصدر الحقيقة الدفعات — 7.11).
 */
import { remaining, sumMinor, type MinorUnits } from '@/shared/money';

export interface ChildSubscriptionInput {
  id: string;
  netAmount: MinorUnits;
}

export interface ChildDebtInput {
  athleteId: string;
  subscriptions: ChildSubscriptionInput[];
  /** مجموع الدفعات غير الملغاة لكل اشتراك (subscriptionId → minor units). */
  paidBySubscription: Record<string, MinorUnits>;
}

export interface ChildDebtResult {
  athleteId: string;
  totalNet: MinorUnits;
  totalPaid: MinorUnits;
  totalDebt: MinorUnits;
  perSubscription: { id: string; netAmount: MinorUnits; paid: MinorUnits; remaining: MinorUnits }[];
}

export interface ParentDebtResult {
  totalNet: MinorUnits;
  totalPaid: MinorUnits;
  totalDebt: MinorUnits;
  perChild: ChildDebtResult[];
}

/** دين طفل واحد = مجموع متبقي اشتراكاته (المتبقي السالب — دفع زائد — لا يُصفّر هنا). */
export function computeChildDebt(input: ChildDebtInput): ChildDebtResult {
  const perSubscription = input.subscriptions.map((s) => {
    const paid = input.paidBySubscription[s.id] ?? 0n;
    return { id: s.id, netAmount: s.netAmount, paid, remaining: remaining(s.netAmount, paid) };
  });
  return {
    athleteId: input.athleteId,
    totalNet: sumMinor(perSubscription.map((s) => s.netAmount)),
    totalPaid: sumMinor(perSubscription.map((s) => s.paid)),
    totalDebt: sumMinor(perSubscription.map((s) => s.remaining)),
    perSubscription,
  };
}

/** ديون ولي الأمر = تجميع ديون كل أبنائه المرتبطين. */
export function computeParentDebts(children: ChildDebtInput[]): ParentDebtResult {
  const perChild = children.map(computeChildDebt);
  return {
    totalNet: sumMinor(perChild.map((c) => c.totalNet)),
    totalPaid: sumMinor(perChild.map((c) => c.totalPaid)),
    totalDebt: sumMinor(perChild.map((c) => c.totalDebt)),
    perChild,
  };
}
