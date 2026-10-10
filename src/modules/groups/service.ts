import type { GroupMember } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, businessRule, conflict, notFound } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import type { AuthContext } from '@/shared/permissions/guard';
import { hasPermission } from '@/shared/permissions/guard';
import { isScopeRestricted, toScoped } from '@/shared/permissions/scope';
import { calcAge, parseDateOnly } from '@/shared/dates';
import { getAgeReferenceMode } from '@/shared/config/settings';
import { ageCategoryRepository } from '@/modules/age-categories/repository';
import { seasonReferenceDate, suggestCategoryForAge } from '@/modules/age-categories/ageRules';
import { groupRepository, type GroupWithDetails, type MemberRow } from './repository';
import {
  availableSeats,
  isValidTimeRange,
  newMaxCapacityValid,
  parseTrainingDays,
  serializeTrainingDays,
  wouldExceedCapacity,
  type CapacitySnapshot,
} from './capacityRules';
import type {
  AddMemberInput,
  CreateGroupInput,
  GroupListQuery,
  MemberListQuery,
  RemoveMemberInput,
  TransferMemberInput,
  UpdateGroupInput,
} from './schema';

const ENTITY = 'Group';
const MEMBER_ENTITY = 'GroupMember';
const OVERRIDE_PERMISSION = 'groups.override_capacity';

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

/** حارس نطاق (IDOR): المدرب المقيّد لا يصل إلا لمجموعاته — NOT_FOUND لا FORBIDDEN. */
function assertGroupInScope(group: GroupWithDetails, user: AuthContext): void {
  const scope = toScoped(user);
  if (!isScopeRestricted(scope)) return;
  if (group.coachId !== scope.linkedCoachId) throw notFound('المجموعة');
}

/** تحذير عدم تطابق الفئة العمرية للرياضي مع فئة المجموعة. */
async function ageMismatchWarning(
  athlete: { birthDate: Date; ageCategoryId: string | null },
  group: { ageCategoryId: string | null },
): Promise<string | null> {
  if (!group.ageCategoryId) return null;
  const mode = await getAgeReferenceMode();
  const categories = await ageCategoryRepository.findAllActive();
  const target = categories.find((c) => c.id === group.ageCategoryId);
  if (!target) return null;
  const reference = mode === 'today' ? new Date() : seasonReferenceDate(new Date(), target.seasonStartMonth);
  const age = calcAge(athlete.birthDate, reference);
  const suggested = suggestCategoryForAge(
    age,
    categories.map((c) => ({ id: c.id, name: c.name, minAge: c.minAge, maxAge: c.maxAge })),
  );
  if (suggested && suggested.id !== group.ageCategoryId) {
    return `الفئة العمرية للرياضي (${suggested.name}) لا تطابق فئة المجموعة (${target.name})`;
  }
  return null;
}

async function assertRelatedExist(
  input: { sportId?: string; ageCategoryId?: string | null; coachId?: string | null; venueId?: string | null },
  tx: PrismaTransaction,
): Promise<void> {
  if (input.sportId) {
    const sport = await tx.sport.findFirst({ where: { id: input.sportId, deletedAt: null }, select: { id: true } });
    if (!sport) throw notFound('النشاط الرياضي');
  }
  if (input.ageCategoryId) {
    const cat = await tx.ageCategory.findFirst({ where: { id: input.ageCategoryId, deletedAt: null }, select: { id: true } });
    if (!cat) throw notFound('الفئة العمرية');
  }
  if (input.coachId) {
    const coach = await tx.coach.findFirst({ where: { id: input.coachId, deletedAt: null, isActive: true }, select: { id: true } });
    if (!coach) throw notFound('المدرب');
  }
  if (input.venueId) {
    const venue = await tx.venue.findFirst({ where: { id: input.venueId, deletedAt: null }, select: { id: true } });
    if (!venue) throw notFound('القاعة/الملعب');
  }
}

export interface MemberOperationResult {
  member: GroupMember;
  capacity: CapacitySnapshot & { available: number };
  warnings: string[];
}

export const groupService = {
  async list(
    query: GroupListQuery,
    user: AuthContext,
  ): Promise<{ items: GroupWithDetails[]; total: number }> {
    return groupRepository.list(query, user);
  },

  async getById(id: string, user: AuthContext): Promise<GroupWithDetails> {
    const group = await groupRepository.findById(id);
    if (!group) throw notFound('المجموعة');
    assertGroupInScope(group, user);
    return group;
  },

  async create(input: CreateGroupInput, meta: Meta): Promise<GroupWithDetails> {
    return prisma.$transaction(async (tx) => {
      const duplicate = await groupRepository.findByCode(input.code, undefined, tx);
      if (duplicate) throw conflict('يوجد مجموعة بنفس الرمز');
      if (input.startTime && input.endTime && !isValidTimeRange(input.startTime, input.endTime)) {
        throw businessRule('فترة التدريب غير صالحة');
      }
      await assertRelatedExist(input, tx);

      const days = input.trainingDays ?? null;
      const created = await tx.group.create({
        data: {
          name: input.name,
          code: input.code,
          sportId: input.sportId,
          ageCategoryId: input.ageCategoryId ?? null,
          coachId: input.coachId ?? null,
          venueId: input.venueId ?? null,
          maxCapacity: input.maxCapacity,
          trainingDays: days ? serializeTrainingDays(days) : null,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          status: input.status,
          notes: input.notes ?? null,
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
      const after = await groupRepository.findById(created.id, tx);
      if (!after) throw notFound('المجموعة');
      return after;
    });
  },

  async update(id: string, input: UpdateGroupInput, meta: Meta): Promise<GroupWithDetails> {
    const { version, overrideReason, ...data } = input;
    return prisma.$transaction(async (tx) => {
      const current = await groupRepository.findById(id, tx);
      if (!current) throw notFound('المجموعة');
      assertGroupInScope(current, meta.user);

      if (data.code && data.code !== current.code) {
        const duplicate = await groupRepository.findByCode(data.code, id, tx);
        if (duplicate) throw conflict('يوجد مجموعة بنفس الرمز');
      }
      await assertRelatedExist(data, tx);

      const nextStart = data.startTime ?? current.startTime;
      const nextEnd = data.endTime ?? current.endTime;
      if (nextStart && nextEnd && !isValidTimeRange(nextStart, nextEnd)) {
        throw businessRule('فترة التدريب غير صالحة');
      }

      // خفض السعة تحت عدد الأعضاء النشطين يتطلب override + سبب إلزامي
      if (data.maxCapacity !== undefined && data.maxCapacity !== current.maxCapacity) {
        const activeCount = await groupRepository.countActiveMembers(id, tx);
        const snapshot: CapacitySnapshot = { maxCapacity: current.maxCapacity, activeCount };
        if (!newMaxCapacityValid(snapshot, data.maxCapacity)) {
          const allowed = await hasPermission(meta.user, OVERRIDE_PERMISSION);
          if (!allowed || !overrideReason) {
            throw new AppError(
              ErrorCode.CAPACITY_EXCEEDED,
              `السعة الجديدة (${data.maxCapacity}) أقل من عدد الأعضاء النشطين (${activeCount}) — يتطلب صلاحية تجاوز السعة وسببًا`,
              { details: { activeCount, newMaxCapacity: data.maxCapacity } },
            );
          }
        }
      }

      const days = data.trainingDays;
      const res = await tx.group.updateMany({
        where: { id, version, deletedAt: null },
        data: {
          ...data,
          trainingDays: days === undefined ? undefined : days ? serializeTrainingDays(days) : null,
          updatedBy: meta.user.userId,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw versionConflictError();

      const after = await groupRepository.findById(id, tx);
      if (!after) throw notFound('المجموعة');
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
          ...(overrideReason ? { metadata: { capacityOverrideReason: overrideReason } } : {}),
        },
        tx,
      );
      return after;
    });
  },

  /** حذف مرن — يُمنع إذا كان هناك أعضاء نشطون. */
  async remove(id: string, version: number, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await groupRepository.findById(id, tx);
      if (!current) throw notFound('المجموعة');
      assertGroupInScope(current, meta.user);

      const activeCount = await groupRepository.countActiveMembers(id, tx);
      if (activeCount > 0) {
        throw businessRule(`لا يمكن حذف مجموعة تضم ${activeCount} عضوًا نشطًا — فرّغ المجموعة أو عطّلها`, {
          activeCount,
        });
      }

      const res = await tx.group.updateMany({
        where: { id, version, deletedAt: null },
        data: { deletedAt: new Date(), status: 'INACTIVE', updatedBy: meta.user.userId, version: { increment: 1 } },
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

  async listMembers(
    groupId: string,
    query: MemberListQuery,
    user: AuthContext,
  ): Promise<{ items: MemberRow[]; total: number }> {
    const group = await groupRepository.findById(groupId);
    if (!group) throw notFound('المجموعة');
    assertGroupInScope(group, user);
    return groupRepository.listMembers(groupId, query);
  },

  /**
   * إضافة عضو — فرض السعة داخل Transaction بقفل صف المجموعة (SELECT ... FOR UPDATE) — 7.6.
   * التجاوز يتطلب صلاحية groups.override_capacity + سبب إلزامي + Audit.
   */
  async addMember(groupId: string, input: AddMemberInput, meta: Meta): Promise<MemberOperationResult> {
    return prisma.$transaction(async (tx) => {
      const group = await groupRepository.findById(groupId, tx);
      if (!group) throw notFound('المجموعة');
      assertGroupInScope(group, meta.user);
      if (group.status !== 'ACTIVE') throw businessRule('لا يمكن إضافة أعضاء إلى مجموعة معطلة');

      const athlete = await tx.athlete.findFirst({
        where: { id: input.athleteId, deletedAt: null },
        select: { id: true, birthDate: true, ageCategoryId: true, status: true },
      });
      if (!athlete) throw notFound('الرياضي');
      if (athlete.status !== 'ACTIVE') {
        throw businessRule('لا يمكن إضافة رياضي غير نشط إلى مجموعة', { status: athlete.status });
      }

      const existing = await groupRepository.findActiveMembership(groupId, input.athleteId, tx);
      if (existing) throw conflict('الرياضي عضو نشط في هذه المجموعة مسبقًا');

      // 1) قفل صف المجموعة لمنع سباق السعة
      const locked = await groupRepository.lockGroupForUpdate(groupId, tx);
      if (!locked) throw notFound('المجموعة');

      // 2) عد الأعضاء النشطين تحت القفل وفرض السعة
      const activeCount = await groupRepository.countActiveMembers(groupId, tx);
      const snapshot: CapacitySnapshot = { maxCapacity: group.maxCapacity, activeCount };
      const warnings: string[] = [];
      let capacityOverridden = false;
      if (wouldExceedCapacity(snapshot, 1)) {
        const allowed = await hasPermission(meta.user, OVERRIDE_PERMISSION);
        if (!allowed || input.overrideCapacity !== true || !input.overrideReason) {
          throw new AppError(
            ErrorCode.CAPACITY_EXCEEDED,
            `المجموعة ممتلئة (${activeCount}/${group.maxCapacity}) — تجاوز السعة يتطلب الصلاحية والسبب`,
            { details: { ...snapshot, available: availableSeats(snapshot) } },
          );
        }
        capacityOverridden = true;
      }

      // 3) تحذيرات (غير مانعة): ازدواجية العضوية في نفس الرياضة + عدم تطابق الفئة العمرية
      const otherMemberships = await groupRepository.findActiveMembershipsOfAthlete(input.athleteId, tx);
      const sameSport = otherMemberships.find((m) => m.group.sportId === group.sportId);
      if (sameSport) {
        warnings.push(`الرياضي عضو نشط في مجموعة أخرى لنفس الرياضة (${sameSport.group.name})`);
      }
      const ageWarning = await ageMismatchWarning(athlete, group);
      if (ageWarning) warnings.push(ageWarning);

      // 4) الإنشاء
      const member = await groupRepository.createMember(
        {
          groupId,
          athleteId: input.athleteId,
          joinedAt: input.joinedAt ? parseDateOnly(input.joinedAt) : new Date(),
          createdBy: meta.user.userId,
        },
        tx,
      );

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: MEMBER_ENTITY,
          entityId: member.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: member,
          metadata: {
            groupId,
            capacityOverride: capacityOverridden,
            ...(capacityOverridden ? { overrideReason: input.overrideReason } : {}),
            warnings,
          },
        },
        tx,
      );

      return {
        member,
        capacity: { ...snapshot, activeCount: activeCount + 1, available: availableSeats({ ...snapshot, activeCount: activeCount + 1 }) },
        warnings,
      };
    });
  },

  /** إنهاء عضوية (مع إبقاء السجل التاريخي leftAt/leaveReason). */
  async removeMember(groupId: string, input: RemoveMemberInput, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const group = await groupRepository.findById(groupId, tx);
      if (!group) throw notFound('المجموعة');
      assertGroupInScope(group, meta.user);

      const membership = await groupRepository.findActiveMembership(groupId, input.athleteId, tx);
      if (!membership) throw notFound('العضوية النشطة');

      await groupRepository.closeMembership(
        membership.id,
        input.leftAt ? parseDateOnly(input.leftAt) : new Date(),
        input.leaveReason,
        tx,
      );
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: MEMBER_ENTITY,
          entityId: membership.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: membership,
          after: { leftAt: input.leftAt ?? new Date(), leaveReason: input.leaveReason },
          metadata: { operation: 'remove_member', groupId },
        },
        tx,
      );
      return { id: membership.id };
    });
  },

  /**
   * تحويل ذري بين مجموعتين: إنهاء العضوية في المصدر وإنشاء عضوية في الهدف
   * داخل Transaction واحد مع قفل صفوف المجموعتين (بترتيب ثابت لتفادي Deadlock).
   */
  async transfer(fromGroupId: string, input: TransferMemberInput, meta: Meta): Promise<MemberOperationResult> {
    if (fromGroupId === input.toGroupId) {
      throw businessRule('مجموعة التحويل الهدف هي نفس المجموعة المصدر');
    }
    return prisma.$transaction(async (tx) => {
      const fromGroup = await groupRepository.findById(fromGroupId, tx);
      if (!fromGroup) throw notFound('المجموعة المصدر');
      assertGroupInScope(fromGroup, meta.user);

      const toGroup = await groupRepository.findById(input.toGroupId, tx);
      if (!toGroup) throw notFound('المجموعة الهدف');
      if (toGroup.status !== 'ACTIVE') throw businessRule('لا يمكن التحويل إلى مجموعة معطلة');

      const membership = await groupRepository.findActiveMembership(fromGroupId, input.athleteId, tx);
      if (!membership) throw notFound('العضوية النشطة في المجموعة المصدر');

      // قفل المجموعتين بترتيب ثابت (أبجديًا) لتفادي Deadlock
      const [firstId, secondId] = [fromGroupId, input.toGroupId].sort();
      for (const lockId of [firstId, secondId]) {
        const locked = await groupRepository.lockGroupForUpdate(lockId, tx);
        if (!locked) throw notFound('المجموعة');
      }

      // فرض سعة المجموعة الهدف
      const activeCount = await groupRepository.countActiveMembers(input.toGroupId, tx);
      const snapshot: CapacitySnapshot = { maxCapacity: toGroup.maxCapacity, activeCount };
      const warnings: string[] = [];
      let capacityOverridden = false;
      if (wouldExceedCapacity(snapshot, 1)) {
        const allowed = await hasPermission(meta.user, OVERRIDE_PERMISSION);
        if (!allowed || input.overrideCapacity !== true || !input.overrideReason) {
          throw new AppError(
            ErrorCode.CAPACITY_EXCEEDED,
            `المجموعة الهدف ممتلئة (${activeCount}/${toGroup.maxCapacity}) — تجاوز السعة يتطلب الصلاحية والسبب`,
            { details: { ...snapshot, available: availableSeats(snapshot) } },
          );
        }
        capacityOverridden = true;
      }

      const athlete = await tx.athlete.findFirst({
        where: { id: input.athleteId, deletedAt: null },
        select: { id: true, birthDate: true, ageCategoryId: true },
      });
      if (!athlete) throw notFound('الرياضي');
      const ageWarning = await ageMismatchWarning(athlete, toGroup);
      if (ageWarning) warnings.push(ageWarning);

      const leftAt = input.leftAt ? parseDateOnly(input.leftAt) : new Date();
      await groupRepository.closeMembership(membership.id, leftAt, `تحويل: ${input.reason}`, tx);
      const member = await groupRepository.createMember(
        {
          groupId: input.toGroupId,
          athleteId: input.athleteId,
          joinedAt: leftAt,
          createdBy: meta.user.userId,
        },
        tx,
      );

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: MEMBER_ENTITY,
          entityId: member.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: membership,
          after: member,
          metadata: {
            operation: 'transfer',
            fromGroupId,
            toGroupId: input.toGroupId,
            reason: input.reason,
            capacityOverride: capacityOverridden,
            ...(capacityOverridden ? { overrideReason: input.overrideReason } : {}),
            warnings,
          },
        },
        tx,
      );

      return {
        member,
        capacity: { ...snapshot, activeCount: activeCount + 1, available: availableSeats({ ...snapshot, activeCount: activeCount + 1 }) },
        warnings,
      };
    });
  },

  /** أيام التدريب المحللة لمجموعة (تُستخدم في توليد الحصص). */
  trainingDaysOf(group: { trainingDays: string | null }): string[] {
    return parseTrainingDays(group.trainingDays);
  },
};
