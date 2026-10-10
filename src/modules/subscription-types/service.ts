import type { SubscriptionType } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, conflict, notFound, businessRule, validationError } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { toMinorUnits, type MinorUnits } from '@/shared/money';
import { getSettings } from '@/modules/settings/service';
import { subscriptionTypeRepository } from './repository';
import type {
  CreateSubscriptionTypeInput,
  UpdateSubscriptionTypeInput,
  SubscriptionTypeListQuery,
} from './schema';

const ENTITY = 'SubscriptionType';

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

/** JSON لا يدعم BigInt — يُحوَّل لنص في Audit والـ DTO. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as T;
}

const big = (v: MinorUnits): string => v.toString();

export interface SubscriptionTypeDto {
  id: string;
  name: string;
  kind: SubscriptionType['kind'];
  sportId: string | null;
  defaultPrice: string;
  durationDays: number | null;
  sessionsTotal: number | null;
  allowPriceEdit: boolean;
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toSubscriptionTypeDto(t: SubscriptionType): SubscriptionTypeDto {
  return {
    id: t.id,
    name: t.name,
    kind: t.kind,
    sportId: t.sportId,
    defaultPrice: big(t.defaultPrice),
    durationDays: t.durationDays,
    sessionsTotal: t.sessionsTotal,
    allowPriceEdit: t.allowPriceEdit,
    isActive: t.isActive,
    version: t.version,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** تحويل السعر العشري (نص) إلى أصغر وحدة وفق إعداد العملة — ممنوع float. */
async function priceToMinor(price: string, decimals?: number): Promise<MinorUnits> {
  const d = decimals ?? (await getSettings()).currencyDecimals;
  const minor = toMinorUnits(price, d);
  if (minor <= 0n) {
    throw validationError({ defaultPrice: ['السعر الافتراضي يجب أن يكون أكبر من صفر'] });
  }
  return minor;
}

export const subscriptionTypeService = {
  async list(query: SubscriptionTypeListQuery): Promise<{ items: SubscriptionTypeDto[]; total: number }> {
    const result = await subscriptionTypeRepository.list(query);
    return { items: result.items.map(toSubscriptionTypeDto), total: result.total };
  },

  async getById(id: string): Promise<SubscriptionTypeDto> {
    const type = await subscriptionTypeRepository.findById(id);
    if (!type) throw notFound('نوع الاشتراك');
    return toSubscriptionTypeDto(type);
  },

  async create(input: CreateSubscriptionTypeInput, meta: Meta): Promise<SubscriptionTypeDto> {
    const settings = await getSettings();
    const defaultPrice = toMinorUnits(input.defaultPrice, settings.currencyDecimals);
    if (defaultPrice <= 0n) {
      throw validationError({ defaultPrice: ['السعر الافتراضي يجب أن يكون أكبر من صفر'] });
    }

    return prisma.$transaction(async (tx) => {
      const duplicate = await subscriptionTypeRepository.findByName(
        input.name,
        input.sportId ?? null,
        undefined,
        tx,
      );
      if (duplicate) throw conflict('يوجد نوع اشتراك بنفس الاسم لنفس النشاط');

      if (input.sportId) {
        const sport = await tx.sport.findFirst({ where: { id: input.sportId, deletedAt: null } });
        if (!sport) throw notFound('النشاط الرياضي');
      }

      const created = await tx.subscriptionType.create({
        data: {
          name: input.name,
          kind: input.kind,
          sportId: input.sportId ?? null,
          defaultPrice,
          durationDays: input.durationDays ?? null,
          sessionsTotal: input.sessionsTotal ?? null,
          allowPriceEdit: input.allowPriceEdit ?? true,
          isActive: input.isActive ?? true,
          createdBy: meta.user.userId,
          updatedBy: meta.user.userId,
        },
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
      return toSubscriptionTypeDto(created);
    });
  },

  async update(id: string, input: UpdateSubscriptionTypeInput, meta: Meta): Promise<SubscriptionTypeDto> {
    const { version, defaultPrice, ...data } = input;
    const settings = await getSettings();
    const defaultPriceMinor = defaultPrice !== undefined
      ? await priceToMinor(defaultPrice, settings.currencyDecimals)
      : undefined;

    return prisma.$transaction(async (tx) => {
      const current = await subscriptionTypeRepository.findById(id, tx);
      if (!current) throw notFound('نوع الاشتراك');

      if (data.sportId) {
        const sport = await tx.sport.findFirst({ where: { id: data.sportId, deletedAt: null } });
        if (!sport) throw notFound('النشاط الرياضي');
      }

      const nextName = data.name ?? current.name;
      const nextSportId = data.sportId !== undefined ? data.sportId : current.sportId;
      if (nextName !== current.name || nextSportId !== current.sportId) {
        const duplicate = await subscriptionTypeRepository.findByName(nextName, nextSportId, id, tx);
        if (duplicate) throw conflict('يوجد نوع اشتراك بنفس الاسم لنفس النشاط');
      }

      // تقليل السعر/تعديله لا يمس الاشتراكات القائمة (أسعارها مثبتة سجلًا)
      const updated = await tx.subscriptionType.updateMany({
        where: { id, version, deletedAt: null },
        data: {
          ...data,
          ...(defaultPriceMinor !== undefined ? { defaultPrice: defaultPriceMinor } : {}),
          updatedBy: meta.user.userId,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw versionConflictError();

      const after = await tx.subscriptionType.findFirstOrThrow({ where: { id, deletedAt: null } });
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
      return toSubscriptionTypeDto(after);
    });
  },

  /** تعطيل/تفعيل — التعطيل لا يحذف التاريخ ولا يمنع عرض الأنواع القديمة. */
  async setActive(id: string, version: number, isActive: boolean, meta: Meta): Promise<SubscriptionTypeDto> {
    return prisma.$transaction(async (tx) => {
      const current = await subscriptionTypeRepository.findById(id, tx);
      if (!current) throw notFound('نوع الاشتراك');

      const res = await tx.subscriptionType.updateMany({
        where: { id, version, deletedAt: null },
        data: { isActive, updatedBy: meta.user.userId, version: { increment: 1 } },
      });
      if (res.count === 0) throw versionConflictError();

      const after = await tx.subscriptionType.findFirstOrThrow({ where: { id, deletedAt: null } });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { isActive: current.isActive },
          after: { isActive },
          metadata: { operation: isActive ? 'enable' : 'disable' },
        },
        tx,
      );
      return toSubscriptionTypeDto(after);
    });
  },

  /** حذف مرن — يُمنع إذا ارتبط باشتراكات (استخدم التعطيل). */
  async remove(id: string, version: number, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await subscriptionTypeRepository.findById(id, tx);
      if (!current) throw notFound('نوع الاشتراك');

      const subscriptions = await subscriptionTypeRepository.countSubscriptions(id, tx);
      if (subscriptions > 0) {
        throw businessRule(
          `لا يمكن حذف نوع مرتبط بـ ${subscriptions} اشتراك — استخدم التعطيل`,
          { subscriptions },
        );
      }

      const res = await tx.subscriptionType.updateMany({
        where: { id, version, deletedAt: null },
        data: { deletedAt: new Date(), updatedBy: meta.user.userId, version: { increment: 1 } },
      });
      if (res.count === 0) throw versionConflictError();

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'DELETE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: jsonSafe(current),
        },
        tx,
      );
      return { id };
    });
  },
};
