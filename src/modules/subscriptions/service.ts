import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import {
  AppError,
  ErrorCode,
  conflict,
  notFound,
  businessRule,
  validationError,
  isAppError,
} from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { toMinorUnits, remaining as remainingOf, type MinorUnits } from '@/shared/money';
import { parseDateOnly, todayIn, addDays } from '@/shared/dates';
import { getSettings, settingsService } from '@/modules/settings/service';
import { subscriptionRepository, subscriptionInclude, type SubscriptionRow } from './repository';
import {
  canTransition,
  computeRenewalStart,
  computeSubscriptionNet,
  deriveEndDate,
  fixedDiscountExceedsPrice,
  isEffectivelyExpired,
  periodLengthDays,
  type DiscountInput,
  type SubscriptionStatusValue,
} from './logic';
import type {
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  RenewSubscriptionInput,
  SuspendSubscriptionInput,
  CancelSubscriptionInput,
  SubscriptionListQuery,
  SubscriptionDiscountInput,
} from './schema';

const ENTITY = 'Subscription';

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

/** JSON لا يدعم BigInt — يُحوَّل لنص في Audit والـ DTO. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as T;
}

const big = (v: MinorUnits): string => v.toString();

/** قراءة إعداد منطقي غير شائع بقيمة افتراضية آمنة عند غيابه. */
async function readBooleanSetting(key: string, fallback: boolean): Promise<boolean> {
  try {
    const dto = await settingsService.get(key);
    return typeof dto.value === 'boolean' ? dto.value : fallback;
  } catch (e) {
    if (isAppError(e) && e.code === ErrorCode.NOT_FOUND) return fallback;
    throw e;
  }
}

/** تحويل خصم وارد (نصوص) إلى أصغر وحدة: FIXED مبلغ، PERCENT نسبة×100. */
function discountToMinor(
  discount: SubscriptionDiscountInput,
  decimals: number,
): DiscountInput & { reason: string } {
  const value =
    discount.kind === 'FIXED'
      ? toMinorUnits(discount.value, decimals)
      : toMinorUnits(discount.value, 2); // "12.5" → 1250n (نسبة × 100)
  return { kind: discount.kind, value, reason: discount.reason };
}

export interface SubscriptionDto {
  id: string;
  athleteId: string;
  athleteName: string;
  registrationNo: string;
  sportId: string | null;
  groupId: string | null;
  groupName: string | null;
  subscriptionTypeId: string;
  subscriptionTypeName: string;
  subscriptionTypeKind: string;
  startDate: Date;
  endDate: Date;
  dueDate: Date;
  price: string;
  discountKind: string | null;
  discountValue: string | null;
  discountReason: string | null;
  discountAmount: string;
  netAmount: string;
  paidAmount: string;
  remainingAmount: string;
  status: SubscriptionStatusValue;
  effectivelyExpired: boolean;
  sessionsTotal: number | null;
  sessionsUsed: number;
  suspendStart: Date | null;
  suspendEnd: Date | null;
  suspendReason: string | null;
  cancelReason: string | null;
  renewedFromId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toSubscriptionDto(s: SubscriptionRow, today: Date): SubscriptionDto {
  const discountAmount = s.netAmount === s.price ? 0n : s.price - s.netAmount;
  return {
    id: s.id,
    athleteId: s.athleteId,
    athleteName: `${s.athlete.firstName} ${s.athlete.lastName}`,
    registrationNo: s.athlete.registrationNo,
    sportId: s.sportId,
    groupId: s.groupId,
    groupName: s.group?.name ?? null,
    subscriptionTypeId: s.subscriptionTypeId,
    subscriptionTypeName: s.subscriptionType.name,
    subscriptionTypeKind: s.subscriptionType.kind,
    startDate: s.startDate,
    endDate: s.endDate,
    dueDate: s.dueDate,
    price: big(s.price),
    discountKind: s.discountKind,
    discountValue: s.discountValue === null ? null : big(s.discountValue),
    discountReason: s.discountReason,
    discountAmount: big(discountAmount),
    netAmount: big(s.netAmount),
    paidAmount: big(s.paidAmount),
    remainingAmount: big(remainingOf(s.netAmount, s.paidAmount)),
    status: s.status,
    effectivelyExpired: isEffectivelyExpired(s.status, s.endDate, today),
    sessionsTotal: s.sessionsTotal,
    sessionsUsed: s.sessionsUsed,
    suspendStart: s.suspendStart,
    suspendEnd: s.suspendEnd,
    suspendReason: s.suspendReason,
    cancelReason: s.cancelReason,
    renewedFromId: s.renewedFromId,
    version: s.version,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

interface PreparedMoney {
  price: MinorUnits;
  discount: (DiscountInput & { reason: string }) | null;
  discountAmount: MinorUnits;
  net: MinorUnits;
}

/** حساب السعر/الخصم/الصافي مع كل التحققات المالية (7.9) — مشترك بين الإنشاء والتجديد. */
function prepareMoney(opts: {
  price: MinorUnits;
  discount: SubscriptionDiscountInput | null | undefined;
  decimals: number;
}): PreparedMoney {
  if (opts.price < 0n) {
    throw validationError({ price: ['السعر لا يمكن أن يكون سالبًا'] });
  }
  let discount: (DiscountInput & { reason: string }) | null = null;
  if (opts.discount) {
    discount = discountToMinor(opts.discount, opts.decimals);
    if (discount.value <= 0n) {
      throw validationError({ 'discount.value': ['قيمة الخصم يجب أن تكون أكبر من صفر'] });
    }
    if (discount.kind === 'FIXED' && fixedDiscountExceedsPrice(opts.price, discount.value)) {
      throw validationError({ 'discount.value': ['الخصم يتجاوز السعر'] });
    }
    if (!discount.reason.trim()) {
      throw validationError({ 'discount.reason': ['سبب الخصم إلزامي'] });
    }
  }
  const { discountAmount, net } = computeSubscriptionNet(opts.price, discount);
  return { price: opts.price, discount, discountAmount, net };
}

async function loadTypeOrThrow(id: string, tx: PrismaTransaction) {
  const type = await tx.subscriptionType.findFirst({ where: { id, deletedAt: null } });
  if (!type) throw notFound('نوع الاشتراك');
  return type;
}

async function assertNoDuplicateActive(
  athleteId: string,
  sportId: string | null,
  excludeId: string | undefined,
  tx: PrismaTransaction,
): Promise<void> {
  const allowMultiple = await readBooleanSetting('subscription.allowMultipleActive', false);
  if (allowMultiple || !sportId) return;
  const existing = await subscriptionRepository.findActiveForAthleteSport(
    athleteId,
    sportId,
    excludeId,
    tx,
  );
  if (existing) {
    throw conflict('يوجد اشتراك نشط آخر لنفس الرياضي في نفس النشاط', {
      existingSubscriptionId: existing.id,
    });
  }
}

export const subscriptionService = {
  async list(
    query: SubscriptionListQuery,
  ): Promise<{ items: SubscriptionDto[]; total: number }> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));
    const result = await subscriptionRepository.list(query, today);
    return { items: result.items.map((s) => toSubscriptionDto(s, today)), total: result.total };
  },

  async getById(id: string): Promise<SubscriptionDto> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));
    const s = await subscriptionRepository.findById(id);
    if (!s) throw notFound('الاشتراك');
    return toSubscriptionDto(s, today);
  },

  async create(input: CreateSubscriptionInput, meta: Meta): Promise<SubscriptionDto> {
    const settings = await getSettings();
    const startDate = parseDateOnly(input.startDate);
    const today = parseDateOnly(todayIn(settings.timezone));

    return prisma.$transaction(async (tx) => {
      const athlete = await tx.athlete.findFirst({
        where: { id: input.athleteId, deletedAt: null },
        select: { id: true, sportId: true, status: true },
      });
      if (!athlete) throw notFound('الرياضي');

      const type = await loadTypeOrThrow(input.subscriptionTypeId, tx);
      if (!type.isActive) throw businessRule('نوع الاشتراك معطل — اختر نوعًا نشطًا');

      if (input.groupId) {
        const group = await tx.group.findFirst({ where: { id: input.groupId, deletedAt: null } });
        if (!group) throw notFound('المجموعة');
        if (group.sportId !== (input.sportId ?? athlete.sportId ?? type.sportId)) {
          throw validationError({ groupId: ['المجموعة لا تتبع نفس النشاط الرياضي'] });
        }
      }

      const sportId = input.sportId ?? athlete.sportId ?? type.sportId;

      // السعر: افتراضي من النوع أو تجاوز مسموح فقط مع allowPriceEdit
      let price = type.defaultPrice;
      if (input.price !== undefined) {
        if (!type.allowPriceEdit) {
          throw businessRule('نوع الاشتراك لا يسمح بتعديل السعر');
        }
        price = toMinorUnits(input.price, settings.currencyDecimals);
      }

      const money = prepareMoney({
        price,
        discount: input.discount ?? null,
        decimals: settings.currencyDecimals,
      });

      // التواريخ: endDate >= startDate (7.9)
      let endDate: Date;
      if (input.endDate) {
        endDate = parseDateOnly(input.endDate);
      } else if (type.durationDays) {
        endDate = deriveEndDate(startDate, type.durationDays);
      } else {
        throw validationError({ endDate: ['تاريخ النهاية مطلوب لنوع الاشتراك هذا'] });
      }
      if (endDate.getTime() < startDate.getTime()) {
        throw validationError({ endDate: ['تاريخ النهاية يجب ألا يسبق تاريخ البداية'] });
      }
      const dueDate = input.dueDate ? parseDateOnly(input.dueDate) : startDate;

      await assertNoDuplicateActive(athlete.id, sportId, undefined, tx);

      const created = await tx.subscription.create({
        data: {
          athleteId: athlete.id,
          sportId,
          groupId: input.groupId ?? null,
          subscriptionTypeId: type.id,
          startDate,
          endDate,
          dueDate,
          price: money.price,
          discountKind: money.discount?.kind ?? null,
          discountValue: money.discount?.value ?? null,
          discountReason: money.discount?.reason ?? null,
          netAmount: money.net,
          paidAmount: 0n,
          status: 'ACTIVE',
          sessionsTotal: input.sessionsTotal ?? type.sessionsTotal,
          sessionsUsed: 0,
          createdBy: meta.user.userId,
          updatedBy: meta.user.userId,
        },
        include: subscriptionInclude,
      });

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: ENTITY,
          entityId: created.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: jsonSafe(created),
        },
        tx,
      );
      return toSubscriptionDto(created, today);
    });
  },

  /**
   * تعديل اشتراك. الحقول المالية (السعر/الخصم/الصافي) والتواريخ
   * ممنوعة بعد وجود دفعات غير ملغاة — التصحيح بالإلغاء ثم إعادة الإدخال (7.11).
   */
  async update(id: string, input: UpdateSubscriptionInput, meta: Meta): Promise<SubscriptionDto> {
    const { version, discount, price, ...rest } = input;
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));

    return prisma.$transaction(async (tx) => {
      const current = await subscriptionRepository.findById(id, tx);
      if (!current) throw notFound('الاشتراك');
      if (current.status === 'CANCELLED') {
        throw businessRule('لا يمكن تعديل اشتراك ملغى');
      }
      await subscriptionRepository.lockRow(id, tx);

      const financialChange =
        price !== undefined || discount !== undefined ||
        rest.startDate !== undefined || rest.endDate !== undefined;
      if (financialChange) {
        const paid = await subscriptionRepository.sumNonVoidedPayments(id, tx);
        if (paid > 0n) {
          throw businessRule(
            'لا يمكن تعديل السعر/الخصم/التواريخ لاشتراك عليه دفعات — ألغِ الدفعة ثم صحّح',
            { paidAmount: big(paid) },
          );
        }
      }

      const type = await loadTypeOrThrow(current.subscriptionTypeId, tx);

      let nextPrice = current.price;
      if (price !== undefined) {
        if (!type.allowPriceEdit) throw businessRule('نوع الاشتراك لا يسمح بتعديل السعر');
        nextPrice = toMinorUnits(price, settings.currencyDecimals);
      }

      let nextDiscount: (DiscountInput & { reason: string }) | null =
        current.discountKind && current.discountValue !== null
          ? { kind: current.discountKind, value: current.discountValue, reason: current.discountReason ?? '' }
          : null;
      if (discount !== undefined) {
        nextDiscount = discount === null ? null : discountToMinor(discount, settings.currencyDecimals);
      }

      const money = computeSubscriptionNet(nextPrice, nextDiscount);
      if (nextDiscount && nextDiscount.kind === 'FIXED' && fixedDiscountExceedsPrice(nextPrice, nextDiscount.value)) {
        throw validationError({ 'discount.value': ['الخصم يتجاوز السعر'] });
      }

      const nextStartDate = rest.startDate ? parseDateOnly(rest.startDate) : current.startDate;
      let nextEndDate = rest.endDate ? parseDateOnly(rest.endDate) : current.endDate;
      if (rest.startDate && !rest.endDate && type.durationDays) {
        nextEndDate = deriveEndDate(nextStartDate, type.durationDays);
      }
      if (nextEndDate.getTime() < nextStartDate.getTime()) {
        throw validationError({ endDate: ['تاريخ النهاية يجب ألا يسبق تاريخ البداية'] });
      }
      const nextDueDate = rest.dueDate ? parseDateOnly(rest.dueDate) : current.dueDate;

      const nextSportId = rest.sportId !== undefined ? rest.sportId : current.sportId;
      if (rest.sportId !== undefined || rest.groupId !== undefined) {
        await assertNoDuplicateActive(current.athleteId, nextSportId, id, tx);
      }

      const res = await tx.subscription.updateMany({
        where: { id, version, deletedAt: null },
        data: {
          sportId: nextSportId,
          groupId: rest.groupId !== undefined ? rest.groupId : current.groupId,
          startDate: nextStartDate,
          endDate: nextEndDate,
          dueDate: nextDueDate,
          price: nextPrice,
          discountKind: nextDiscount?.kind ?? null,
          discountValue: nextDiscount?.value ?? null,
          discountReason: nextDiscount?.reason ?? null,
          netAmount: money.net,
          sessionsTotal: rest.sessionsTotal !== undefined ? rest.sessionsTotal : current.sessionsTotal,
          updatedBy: meta.user.userId,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw versionConflictError();

      const after = await subscriptionRepository.findById(id, tx);
      if (!after) throw notFound('الاشتراك');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: jsonSafe(current),
          after: jsonSafe(after),
        },
        tx,
      );
      return toSubscriptionDto(after, today);
    });
  },

  /**
   * التجديد (7.9): لا يُعدَّل القديم ولا يُحذف أبدًا —
   * يُنشأ اشتراك جديد مرتبط بـ renewedFromId، ويصبح القديم RENEWING.
   */
  async renew(id: string, input: RenewSubscriptionInput, meta: Meta): Promise<SubscriptionDto> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));
    const startTodayWhenExpired = await readBooleanSetting(
      'subscription.renewStartTodayWhenExpired',
      true,
    );

    return prisma.$transaction(async (tx) => {
      const current = await subscriptionRepository.findById(id, tx);
      if (!current) throw notFound('الاشتراك');
      await subscriptionRepository.lockRow(id, tx);

      const effectiveStatus: SubscriptionStatusValue = isEffectivelyExpired(
        current.status,
        current.endDate,
        today,
      )
        ? 'EXPIRED'
        : current.status;
      if (!canTransition(effectiveStatus, 'RENEWING')) {
        throw businessRule(`لا يمكن تجديد اشتراك بحالة ${effectiveStatus}`);
      }

      const type = await loadTypeOrThrow(current.subscriptionTypeId, tx);

      const startDate = input.startDate
        ? parseDateOnly(input.startDate)
        : computeRenewalStart({
            previousEnd: current.endDate,
            today,
            startFromTodayWhenExpired: startTodayWhenExpired,
          });

      let endDate: Date;
      if (input.endDate) {
        endDate = parseDateOnly(input.endDate);
      } else if (type.durationDays) {
        endDate = deriveEndDate(startDate, type.durationDays);
      } else {
        // نوع بلا مدة ثابتة (حصص/CUSTOM) — نفس طول الفترة السابقة
        endDate = addDays(startDate, periodLengthDays(current.startDate, current.endDate) - 1);
      }
      if (endDate.getTime() < startDate.getTime()) {
        throw validationError({ endDate: ['تاريخ النهاية يجب ألا يسبق تاريخ البداية'] });
      }

      let price = type.defaultPrice;
      if (input.price !== undefined) {
        if (!type.allowPriceEdit) throw businessRule('نوع الاشتراك لا يسمح بتعديل السعر');
        price = toMinorUnits(input.price, settings.currencyDecimals);
      }
      const money = prepareMoney({
        price,
        discount: input.discount ?? null,
        decimals: settings.currencyDecimals,
      });

      const dueDate = input.dueDate ? parseDateOnly(input.dueDate) : startDate;

      // القديم → RENEWING (بتحقق الإصدار)
      const res = await tx.subscription.updateMany({
        where: { id, version: input.version, deletedAt: null },
        data: { status: 'RENEWING', updatedBy: meta.user.userId, version: { increment: 1 } },
      });
      if (res.count === 0) throw versionConflictError();

      const created = await tx.subscription.create({
        data: {
          athleteId: current.athleteId,
          sportId: current.sportId,
          groupId: current.groupId,
          subscriptionTypeId: type.id,
          startDate,
          endDate,
          dueDate,
          price: money.price,
          discountKind: money.discount?.kind ?? null,
          discountValue: money.discount?.value ?? null,
          discountReason: money.discount?.reason ?? null,
          netAmount: money.net,
          paidAmount: 0n,
          status: 'ACTIVE',
          sessionsTotal: type.sessionsTotal,
          sessionsUsed: 0,
          renewedFromId: current.id,
          createdBy: meta.user.userId,
          updatedBy: meta.user.userId,
        },
        include: subscriptionInclude,
      });

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: current.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { status: current.status },
          after: { status: 'RENEWING' },
          metadata: { operation: 'renew', newSubscriptionId: created.id },
        },
        tx,
      );
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: ENTITY,
          entityId: created.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: jsonSafe(created),
          metadata: { operation: 'renewal', renewedFromId: current.id },
        },
        tx,
      );
      return toSubscriptionDto(created, today);
    });
  },

  async suspend(id: string, input: SuspendSubscriptionInput, meta: Meta): Promise<SubscriptionDto> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));

    return prisma.$transaction(async (tx) => {
      const current = await subscriptionRepository.findById(id, tx);
      if (!current) throw notFound('الاشتراك');
      if (!canTransition(current.status, 'SUSPENDED')) {
        throw businessRule(`لا يمكن إيقاف اشتراك بحالة ${current.status}`);
      }
      const suspendEnd = input.suspendEnd ? parseDateOnly(input.suspendEnd) : null;
      if (suspendEnd && suspendEnd.getTime() < today.getTime()) {
        throw validationError({ suspendEnd: ['تاريخ نهاية الإيقاف يجب ألا يكون في الماضي'] });
      }

      const res = await tx.subscription.updateMany({
        where: { id, version: input.version, deletedAt: null },
        data: {
          status: 'SUSPENDED',
          suspendStart: today,
          suspendEnd,
          suspendReason: input.reason,
          updatedBy: meta.user.userId,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw versionConflictError();

      const after = await subscriptionRepository.findById(id, tx);
      if (!after) throw notFound('الاشتراك');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { status: current.status },
          after: { status: 'SUSPENDED', suspendStart: today, suspendEnd, suspendReason: input.reason },
          metadata: { operation: 'suspend' },
        },
        tx,
      );
      return toSubscriptionDto(after, today);
    });
  },

  async resume(id: string, version: number, meta: Meta): Promise<SubscriptionDto> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));

    return prisma.$transaction(async (tx) => {
      const current = await subscriptionRepository.findById(id, tx);
      if (!current) throw notFound('الاشتراك');
      if (!canTransition(current.status, 'ACTIVE')) {
        throw businessRule(`لا يمكن استئناف اشتراك بحالة ${current.status}`);
      }

      const res = await tx.subscription.updateMany({
        where: { id, version, deletedAt: null },
        data: { status: 'ACTIVE', updatedBy: meta.user.userId, version: { increment: 1 } },
      });
      if (res.count === 0) throw versionConflictError();

      const after = await subscriptionRepository.findById(id, tx);
      if (!after) throw notFound('الاشتراك');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { status: current.status },
          after: { status: 'ACTIVE' },
          metadata: { operation: 'resume', suspendStart: current.suspendStart, suspendEnd: current.suspendEnd },
        },
        tx,
      );
      return toSubscriptionDto(after, today);
    });
  },

  /** الإلغاء من أي حالة — بسبب إلزامي (7.10). لا يُمسح السجل ولا يُعدَّل ماليًا. */
  async cancel(id: string, input: CancelSubscriptionInput, meta: Meta): Promise<SubscriptionDto> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));

    return prisma.$transaction(async (tx) => {
      const current = await subscriptionRepository.findById(id, tx);
      if (!current) throw notFound('الاشتراك');
      if (!canTransition(current.status, 'CANCELLED')) {
        throw businessRule('الاشتراك ملغى مسبقًا');
      }

      const res = await tx.subscription.updateMany({
        where: { id, version: input.version, deletedAt: null },
        data: {
          status: 'CANCELLED',
          cancelReason: input.reason,
          updatedBy: meta.user.userId,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw versionConflictError();

      const after = await subscriptionRepository.findById(id, tx);
      if (!after) throw notFound('الاشتراك');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { status: current.status },
          after: { status: 'CANCELLED', cancelReason: input.reason },
          metadata: { operation: 'cancel', reason: input.reason },
        },
        tx,
      );
      return toSubscriptionDto(after, today);
    });
  },

  /**
   * إنهاء تلقائي ACTIVE → EXPIRED لمن تجاوزت endDate (7.10).
   * تُستدعى من مهمة مجدولة أو كخطوة تهيئة قبل القوائم المالية.
   */
  async expireOverdue(meta: Meta): Promise<{ updated: number }> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));
    return prisma.$transaction(async (tx) => {
      const count = await subscriptionRepository.markExpiredBefore(today, meta.user.userId, tx);
      if (count > 0) {
        await writeAudit(
          {
            userId: meta.user.userId,
            action: 'UPDATE',
            entityType: ENTITY,
            requestId: meta.requestId,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
            metadata: { operation: 'auto-expire', count, today: today.toISOString().slice(0, 10) },
          },
          tx,
        );
      }
      return { updated: count };
    });
  },
};
