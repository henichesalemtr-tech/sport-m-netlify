import { prisma } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, notFound, businessRule, validationError } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { toMinorUnits, type MinorUnits } from '@/shared/money';
import { parseDateOnly, todayIn, fiscalYear } from '@/shared/dates';
import { isUniqueViolation } from '@/shared/idempotency';
import { getSettings } from '@/modules/settings/service';
import { cashService } from '@/modules/cash/service';
import { receiptService } from '@/modules/receipts/service';
import { paymentRepository, type PaymentRow } from './repository';
import {
  computePaymentNet,
  evaluatePayment,
  isValidRefund,
  nextTransactionNo,
  paidAfterNewPayment,
  paidAfterVoid,
} from './logic';
import type {
  CreatePaymentInput,
  VoidPaymentInput,
  RefundPaymentInput,
  UpdatePaymentNotesInput,
  PaymentListQuery,
} from './schema';

const ENTITY = 'Payment';

const big = (v: MinorUnits): string => v.toString();

/** JSON لا يدعم BigInt — يُحوَّل لنص في Audit والـ DTO. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as T;
}

export interface PaymentDto {
  id: string;
  transactionNo: string;
  athleteId: string;
  athleteName: string;
  registrationNo: string;
  subscriptionId: string;
  subscriptionTypeName: string;
  subscriptionNetAmount: string;
  subscriptionRemaining: string;
  amount: string;
  discount: string;
  netAmount: string;
  refundedAmount: string;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentDate: Date;
  status: PaymentRow['status'];
  voidReason: string | null;
  voidedAt: Date | null;
  employeeId: string | null;
  notes: string | null;
  receiptId: string | null;
  receiptNo: string | null;
  createdAt: Date;
}

export interface PaymentCreateResult {
  payment: PaymentDto;
  receiptNo: string;
  /** المتبقي على الاشتراك بعد الدفعة (سالب = دفع زائد مسموح بالإعداد). */
  remainingAfter: string;
  /** true عند إعادة إرسال نفس Idempotency-Key — لم تُنفَّذ العملية مرتين. */
  replayed: boolean;
}

function toPaymentDto(p: PaymentRow): PaymentDto {
  const subscriptionRemaining = p.subscription.netAmount - p.subscription.paidAmount;
  return {
    id: p.id,
    transactionNo: p.transactionNo,
    athleteId: p.athleteId,
    athleteName: `${p.athlete.firstName} ${p.athlete.lastName}`,
    registrationNo: p.athlete.registrationNo,
    subscriptionId: p.subscriptionId,
    subscriptionTypeName: p.subscription.subscriptionType.name,
    subscriptionNetAmount: big(p.subscription.netAmount),
    subscriptionRemaining: big(subscriptionRemaining),
    amount: big(p.amount),
    discount: big(p.discount),
    netAmount: big(p.netAmount),
    refundedAmount: big(p.refundedAmount),
    paymentMethodId: p.paymentMethod.id,
    paymentMethodName: p.paymentMethod.name,
    paymentDate: p.paymentDate,
    status: p.status,
    voidReason: p.voidReason,
    voidedAt: p.voidedAt,
    employeeId: p.employeeId,
    notes: p.notes,
    receiptId: p.receipt?.id ?? null,
    receiptNo: p.receipt?.receiptNo ?? null,
    createdAt: p.createdAt,
  };
}

export const paymentService = {
  /**
   * إنشاء دفعة — عملية مالية كاملة داخل معاملة واحدة (7.11):
   * الدفعة + إعادة اشتقاق paidAmount من الدفعات غير الملغاة + قيد خزينة INCOME
   * + وصل تسلسلي بلا فجوات + Audit. أي فشل = تراجع كامل (Rollback).
   * Idempotency-Key + قيد فريد: عند P2002 تُعاد النتيجة السابقة دون تنفيذ مزدوج.
   */
  async create(
    input: CreatePaymentInput,
    meta: Meta,
    idempotencyKey?: string,
  ): Promise<PaymentCreateResult> {
    const settings = await getSettings();
    try {
      return await prisma.$transaction(async (tx) => {
        // 1) قفل صف الاشتراك ومنع السباق
        const locked = await paymentRepository.lockSubscription(input.subscriptionId, tx);
        if (!locked) throw notFound('الاشتراك');
        const subscription = await paymentRepository.findSubscriptionById(input.subscriptionId, tx);
        if (!subscription) throw notFound('الاشتراك');
        if (subscription.athleteId !== input.athleteId) {
          throw validationError({ athleteId: ['الرياضي لا يطابق صاحب الاشتراك'] });
        }
        if (subscription.status === 'CANCELLED') {
          throw businessRule('لا يمكن تسجيل دفعة على اشتراك ملغى');
        }

        // 2) تحققات المبلغ (BigInt بأصغر وحدة — ممنوع float)
        const amount = toMinorUnits(input.amount, settings.currencyDecimals);
        if (amount <= 0n) {
          throw new AppError(ErrorCode.INVALID_AMOUNT, 'مبلغ الدفعة يجب أن يكون أكبر من صفر');
        }
        const discount = input.discount
          ? toMinorUnits(input.discount, settings.currencyDecimals)
          : 0n;
        if (discount < 0n) {
          throw new AppError(ErrorCode.INVALID_AMOUNT, 'الخصم لا يمكن أن يكون سالبًا');
        }
        const { net } = computePaymentNet(amount, discount);

        // 3) المتبقي ورفض الدفع الزائد (OVERPAYMENT) إلا بإعداد payment.allowOverpay
        const paidNonVoided = await paymentRepository.sumNonVoided(subscription.id, tx);
        const evaluation = evaluatePayment({
          subscriptionNet: subscription.netAmount,
          paidNonVoided,
          paymentNet: net,
          allowOverpay: settings.allowOverpay,
        });
        if (!evaluation.allowed) {
          throw new AppError(
            ErrorCode.OVERPAYMENT,
            'مبلغ الدفعة يتجاوز المتبقي على الاشتراك والدفع الزائد غير مسموح',
            {
              details: {
                remainingBefore: big(evaluation.remainingBefore),
                paymentNet: big(net),
              },
            },
          );
        }

        // 4) طريقة الدفع والتاريخ والسنة المالية
        const method = await paymentRepository.findMethodById(input.paymentMethodId, tx);
        if (!method) throw notFound('طريقة الدفع');
        const paymentDate = parseDateOnly(input.paymentDate);
        const fy = fiscalYear(paymentDate, settings.fiscalStartMonth, settings.timezone);

        // 5) رقم الحركة التسلسلي (قفل استشاري بمفتاح السنة)
        const sequence = await paymentRepository.lockTransactionSequence(fy, tx);
        const transactionNo = nextTransactionNo(fy, sequence);

        // 6) إنشاء الدفعة
        const payment = await tx.payment.create({
          data: {
            transactionNo,
            athleteId: input.athleteId,
            subscriptionId: subscription.id,
            amount,
            discount,
            netAmount: net,
            paymentMethodId: method.id,
            paymentDate,
            status: 'COMPLETED',
            employeeId: input.employeeId ?? null,
            notes: input.notes ?? null,
            idempotencyKey: idempotencyKey ?? null,
            createdBy: meta.user.userId,
          },
        });

        // 7) إعادة اشتقاق paidAmount من الدفعات غير الملغاة (مصدر الحقيقة)
        const newPaid = paidAfterNewPayment(paidNonVoided, net);
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { paidAmount: newPaid, updatedBy: meta.user.userId, version: { increment: 1 } },
        });

        // 8) قيد خزينة INCOME مع balanceAfter (يرفض الأيام المقفلة)
        const cashEntry = await cashService.appendEntry(tx, {
          type: 'INCOME',
          amount: net,
          referenceType: 'payment',
          referenceId: payment.id,
          reason: `دفعة ${transactionNo} — ${subscription.subscriptionType.name}`,
          txDate: paymentDate,
          createdBy: meta.user.userId,
        });

        // 9) وصل تسلسلي بلا فجوات لنفس السنة المالية + ربطه بالدفعة
        const receipt = await receiptService.createInTx(tx, {
          paymentId: payment.id,
          fiscalYear: fy,
          template: settings.receiptTemplate,
        });
        await tx.payment.update({ where: { id: payment.id }, data: { receiptId: receipt.id } });

        // 10) Audit داخل نفس المعاملة
        await writeAudit(
          {
            userId: meta.user.userId,
            action: 'CREATE',
            entityType: ENTITY,
            entityId: payment.id,
            requestId: meta.requestId,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
            after: jsonSafe({ ...payment, receiptNo: receipt.receiptNo }),
            metadata: {
              cashTransactionId: cashEntry.id,
              balanceAfter: big(cashEntry.balanceAfter),
              remainingAfter: big(evaluation.remainingAfter),
              idempotencyKey: idempotencyKey ?? null,
            },
          },
          tx,
        );

        const row = await paymentRepository.findById(payment.id, tx);
        if (!row) throw notFound('الدفعة');
        return {
          payment: toPaymentDto(row),
          receiptNo: receipt.receiptNo,
          remainingAfter: big(evaluation.remainingAfter),
          replayed: false,
        };
      });
    } catch (e) {
      // إعادة إرسال نفس مفتاح Idempotency → إرجاع النتيجة السابقة (بلا تنفيذ مزدوج)
      if (idempotencyKey && isUniqueViolation(e)) {
        const existing = await paymentRepository.findByIdempotencyKey(idempotencyKey);
        if (existing) {
          return {
            payment: toPaymentDto(existing),
            receiptNo: existing.receipt?.receiptNo ?? '',
            remainingAfter: big(existing.subscription.netAmount - existing.subscription.paidAmount),
            replayed: true,
          };
        }
      }
      throw e;
    }
  },

  /**
   * إلغاء دفعة (VOID) — الدفعات غير قابلة للتعديل/الحذف ماليًا (7.11).
   * التصحيح يتم بإلغاء + قيد خزينة عكسي بتاريخ مفتوح ثم دفعة جديدة.
   */
  async void(id: string, input: VoidPaymentInput, meta: Meta): Promise<PaymentDto> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));

    return prisma.$transaction(async (tx) => {
      const payment = await paymentRepository.findById(id, tx);
      if (!payment) throw notFound('الدفعة');
      if (payment.status === 'VOIDED') {
        throw businessRule('الدفعة ملغاة مسبقًا');
      }

      await paymentRepository.lockSubscription(payment.subscriptionId, tx);
      const paidNonVoided = await paymentRepository.sumNonVoided(payment.subscriptionId, tx);

      await tx.payment.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidReason: input.reason,
          voidedAt: new Date(),
          voidedBy: meta.user.userId,
        },
      });

      // إعادة اشتقاق المدفوع من بقية الدفعات غير الملغاة
      await tx.subscription.update({
        where: { id: payment.subscriptionId },
        data: {
          paidAmount: paidAfterVoid(paidNonVoided, payment.netAmount),
          updatedBy: meta.user.userId,
          version: { increment: 1 },
        },
      });

      // الوصل يبقى محفوظًا (بلا فجوات) ويوسم "ملغى"
      if (payment.receiptId) {
        await receiptService.voidInTx(tx, payment.receiptId);
      }

      // قيد عكسي بتاريخ اليوم (قد يكون يوم الدفعة مقفلًا)
      await cashService.appendEntry(tx, {
        type: 'REVERSAL',
        amount: -payment.netAmount,
        referenceType: 'payment',
        referenceId: payment.id,
        reason: `إلغاء الدفعة ${payment.transactionNo}: ${input.reason}`,
        txDate: today,
        createdBy: meta.user.userId,
      });

      const after = await paymentRepository.findById(id, tx);
      if (!after) throw notFound('الدفعة');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'VOID',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: jsonSafe(payment),
          after: jsonSafe(after),
          metadata: { operation: 'void', reason: input.reason },
        },
        tx,
      );
      return toPaymentDto(after);
    });
  },

  /** استرداد كلي/جزئي من دفعة — يقلل الخزينة ولا يغير paidAmount (يُسجَّل في refundedAmount). */
  async refund(id: string, input: RefundPaymentInput, meta: Meta): Promise<PaymentDto> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));
    const amount = toMinorUnits(input.amount, settings.currencyDecimals);

    return prisma.$transaction(async (tx) => {
      const payment = await paymentRepository.findById(id, tx);
      if (!payment) throw notFound('الدفعة');
      if (payment.status === 'VOIDED') {
        throw businessRule('لا يمكن استرداد دفعة ملغاة — الإلغاء يغطي التصحيح');
      }
      if (!isValidRefund(payment.netAmount, payment.refundedAmount, amount)) {
        throw validationError({
          amount: ['مبلغ الاسترداد يجب أن يكون أكبر من صفر وألا يتجاوز المتاح للاسترداد'],
        });
      }

      await tx.payment.update({
        where: { id },
        data: { refundedAmount: { increment: amount } },
      });

      await cashService.appendEntry(tx, {
        type: 'EXPENSE',
        amount, // قيمة مطلقة — signedAmount يجعلها سالبة
        referenceType: 'refund',
        referenceId: payment.id,
        reason: `استرداد من الدفعة ${payment.transactionNo}: ${input.reason}`,
        txDate: today,
        createdBy: meta.user.userId,
      });

      const after = await paymentRepository.findById(id, tx);
      if (!after) throw notFound('الدفعة');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'REFUND',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: jsonSafe({ refundedAmount: big(payment.refundedAmount) }),
          after: jsonSafe({ refundedAmount: big(after.refundedAmount) }),
          metadata: { operation: 'refund', reason: input.reason, amount: big(amount) },
        },
        tx,
      );
      return toPaymentDto(after);
    });
  },

  /** الملاحظات هي الحقل الوحيد القابل للتعديل في الدفعة (7.11) — مع Audit. */
  async updateNotes(id: string, input: UpdatePaymentNotesInput, meta: Meta): Promise<PaymentDto> {
    return prisma.$transaction(async (tx) => {
      const payment = await paymentRepository.findById(id, tx);
      if (!payment) throw notFound('الدفعة');

      await tx.payment.update({ where: { id }, data: { notes: input.notes } });
      const after = await paymentRepository.findById(id, tx);
      if (!after) throw notFound('الدفعة');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { notes: payment.notes },
          after: { notes: input.notes },
          metadata: { operation: 'update_notes' },
        },
        tx,
      );
      return toPaymentDto(after);
    });
  },

  async getById(id: string): Promise<PaymentDto> {
    const payment = await paymentRepository.findById(id);
    if (!payment) throw notFound('الدفعة');
    return toPaymentDto(payment);
  },

  async list(query: PaymentListQuery): Promise<{ items: PaymentDto[]; total: number }> {
    const result = await paymentRepository.list(query);
    return { items: result.items.map(toPaymentDto), total: result.total };
  },
};
