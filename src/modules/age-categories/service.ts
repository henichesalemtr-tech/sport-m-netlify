import type { AgeCategory } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, businessRule, conflict, notFound } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { calcAge, parseDateOnly } from '@/shared/dates';
import { getAgeReferenceMode } from '@/shared/config/settings';
import { ageCategoryRepository } from './repository';
import {
  seasonReferenceDate,
  suggestCategoryForAge,
  validateCategories,
  type CategoryRange,
} from './ageRules';
import type {
  AgeCategoryListQuery,
  CreateAgeCategoryInput,
  SuggestQuery,
  UpdateAgeCategoryInput,
} from './schema';

const ENTITY = 'AgeCategory';

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

function toRange(c: AgeCategory): CategoryRange {
  return { id: c.id, name: c.name, minAge: c.minAge, maxAge: c.maxAge };
}

/**
 * فرض الاستمرارية: لا تداخل ولا فجوات بين الفئات النشطة (قاعدة عمل 7.2).
 * تُبنى القائمة المرشحة = الفئات النشطة الحالية ± الفئة قيد الحفظ.
 */
function assertContinuity(current: AgeCategory[], candidate: AgeCategory | null, candidateId?: string): void {
  if (candidate !== null && !candidate.isActive) return; // الفئات المعطلة لا تُفحص
  const list = current
    .filter((c) => c.id !== candidateId)
    .map(toRange);
  if (candidate !== null) {
    list.push({
      id: candidateId ?? candidate.id ?? 'new',
      name: candidate.name,
      minAge: candidate.minAge ?? null,
      maxAge: candidate.maxAge ?? null,
    });
  }
  const result = validateCategories(list);
  if (!result.valid) {
    throw businessRule('فئات الأعمار غير متصلة — يجب ألا يوجد تداخل أو فجوة بين الفئات', {
      overlaps: result.overlaps,
      gaps: result.gaps,
    });
  }
}

export interface SuggestResult {
  birthDate: string;
  referenceDate: string;
  age: number;
  category: AgeCategory | null;
}

export const ageCategoryService = {
  async list(query: AgeCategoryListQuery): Promise<{ items: AgeCategory[]; total: number }> {
    return ageCategoryRepository.list(query);
  },

  async getById(id: string): Promise<AgeCategory> {
    const category = await ageCategoryRepository.findById(id);
    if (!category) throw notFound('الفئة العمرية');
    return category;
  },

  async create(input: CreateAgeCategoryInput, meta: Meta): Promise<AgeCategory> {
    return prisma.$transaction(async (tx) => {
      const duplicate = await ageCategoryRepository.findByName(input.name, undefined, tx);
      if (duplicate) throw conflict('توجد فئة عمرية بنفس الاسم');

      const current = await ageCategoryRepository.findAllActive(tx);
      const merged: AgeCategory = {
        id: 'new',
        name: input.name,
        kind: input.kind,
        minAge: input.minAge ?? null,
        maxAge: input.kind === 'SENIOR' ? null : (input.maxAge ?? null),
        seasonStartMonth: input.seasonStartMonth,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
        version: 0,
      };
      assertContinuity(current, merged);

      const created = await tx.ageCategory.create({
        data: {
          name: input.name,
          kind: input.kind,
          minAge: input.minAge ?? null,
          maxAge: input.kind === 'SENIOR' ? null : (input.maxAge ?? null),
          seasonStartMonth: input.seasonStartMonth,
          sortOrder: input.sortOrder ?? 0,
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
          after: created,
        },
        tx,
      );
      return created;
    });
  },

  async update(id: string, input: UpdateAgeCategoryInput, meta: Meta): Promise<AgeCategory> {
    const { version, ...data } = input;
    return prisma.$transaction(async (tx) => {
      const current = await ageCategoryRepository.findById(id, tx);
      if (!current) throw notFound('الفئة العمرية');

      if (data.name && data.name !== current.name) {
        const duplicate = await ageCategoryRepository.findByName(data.name, id, tx);
        if (duplicate) throw conflict('توجد فئة عمرية بنفس الاسم');
      }

      const kind = data.kind ?? current.kind;
      const minAge = data.minAge === undefined ? current.minAge : data.minAge;
      const maxAge =
        kind === 'SENIOR'
          ? null
          : data.maxAge === undefined
            ? current.maxAge
            : data.maxAge;
      if (kind === 'SENIOR' && minAge === null) {
        throw businessRule('فئة الأكابر تتطلب عمرًا أدنى');
      }
      if (kind === 'NORMAL' && (minAge === null || maxAge === null)) {
        throw businessRule('الفئة العادية تتطلب عمرًا أدنى وأقصى');
      }
      if (minAge !== null && maxAge !== null && maxAge < minAge) {
        throw businessRule('العمر الأقصى يجب أن يكون أكبر من أو يساوي الأدنى');
      }

      const rangeChanged = minAge !== current.minAge || maxAge !== current.maxAge;
      const becomesActive = (data.isActive ?? current.isActive) === true;
      if (rangeChanged && becomesActive) {
        const active = await ageCategoryRepository.findAllActive(tx);
        assertContinuity(
          active,
          { ...current, kind, minAge, maxAge, isActive: true },
          id,
        );
      }

      const updated = await tx.ageCategory.updateMany({
        where: { id, version, deletedAt: null },
        data: { ...data, minAge, maxAge, updatedBy: meta.user.userId, version: { increment: 1 } },
      });
      if (updated.count === 0) throw versionConflictError();
      const after = await tx.ageCategory.findFirstOrThrow({ where: { id, deletedAt: null } });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: current,
          after,
        },
        tx,
      );
      return after;
    });
  },

  /** حذف مرن — يُمنع إذا ارتبطت الفئة بمجموعات أو رياضيين. */
  async remove(id: string, version: number, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await ageCategoryRepository.findById(id, tx);
      if (!current) throw notFound('الفئة العمرية');

      const groups = await ageCategoryRepository.countGroups(id);
      const athletes = await ageCategoryRepository.countAthletes(id);
      if (groups > 0 || athletes > 0) {
        throw businessRule('لا يمكن حذف فئة مرتبطة بمجموعات أو رياضيين — استخدم التعطيل', {
          groups,
          athletes,
        });
      }

      const res = await tx.ageCategory.updateMany({
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
          before: current,
        },
        tx,
      );
      return { id };
    });
  },

  /**
   * اقتراح الفئة العمرية من تاريخ الميلاد.
   * التاريخ المرجعي قابل للضبط (Settings: age.reference_mode) — اليوم أو بداية الموسم.
   */
  async suggest(query: SuggestQuery): Promise<SuggestResult> {
    const birthDate = parseDateOnly(query.birthDate);
    const mode = await getAgeReferenceMode();
    const categories = await ageCategoryRepository.findAllActive();
    const now = query.referenceDate ? parseDateOnly(query.referenceDate) : new Date();

    // التاريخ المرجعي: صريح > وضع "اليوم" > بداية موسم الفئة نفسها
    const referenceFor = (c: AgeCategory): Date =>
      query.referenceDate || mode === 'today' ? now : seasonReferenceDate(now, c.seasonStartMonth);

    for (const c of categories) {
      const reference = referenceFor(c);
      const age = calcAge(birthDate, reference);
      const suggested = suggestCategoryForAge(age, [toRange(c)]);
      if (suggested !== null) {
        return {
          birthDate: query.birthDate,
          referenceDate: reference.toISOString().slice(0, 10),
          age,
          category: c,
        };
      }
    }

    // لا فئة تغطي العمر — نُعيد العمر المحسوب على مرجع عام بلا اقتراح
    const fallbackReference = query.referenceDate || mode === 'today' ? now : seasonReferenceDate(now, 9);
    return {
      birthDate: query.birthDate,
      referenceDate: fallbackReference.toISOString().slice(0, 10),
      age: calcAge(birthDate, fallbackReference),
      category: null,
    };
  },
};
