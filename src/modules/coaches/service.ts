import type { Coach } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, businessRule, notFound } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { parseDateOnly } from '@/shared/dates';
import { coachRepository, type CoachWithDetails } from './repository';
import type { CoachListQuery, CreateCoachInput, UpdateCoachInput } from './schema';

const ENTITY = 'Coach';

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

/** تحقق من صلاحية ربط المدرب بحساب مستخدم (دور COACH، نشط، غير مربوط بمدرب آخر). */
async function assertLinkableUser(
  userId: string,
  coachId: string | null,
  tx?: PrismaTransaction,
): Promise<void> {
  const user = await coachRepository.findLinkableUser(userId, tx);
  if (!user) throw notFound('المستخدم المراد ربطه');
  if (user.role !== 'COACH') {
    throw businessRule('لا يمكن ربط المدرب إلا بحساب دوره COACH', { role: user.role });
  }
  if (user.status !== 'ACTIVE') {
    throw businessRule('لا يمكن ربط المدرب بحساب مستخدم معطل');
  }
  if (user.linkedCoachId !== null && user.linkedCoachId !== coachId) {
    throw businessRule('المستخدم مربوط بمدرب آخر — فك الربط أولًا', {
      linkedCoachId: user.linkedCoachId,
    });
  }
}

export const coachService = {
  async list(query: CoachListQuery): Promise<{ items: CoachWithDetails[]; total: number }> {
    return coachRepository.list(query);
  },

  async getById(id: string): Promise<CoachWithDetails> {
    const coach = await coachRepository.findById(id);
    if (!coach) throw notFound('المدرب');
    return coach;
  },

  async create(input: CreateCoachInput, meta: Meta): Promise<CoachWithDetails> {
    return prisma.$transaction(async (tx) => {
      const sportIds = [...new Set(input.sportIds ?? [])];
      if (sportIds.length > 0) {
        const count = await tx.sport.count({ where: { id: { in: sportIds }, deletedAt: null } });
        if (count !== sportIds.length) throw notFound('أحد الرياضات المرتبطة');
      }
      if (input.linkedUserId) await assertLinkableUser(input.linkedUserId, null, tx);

      const created = await tx.coach.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          photoUrl: input.photoUrl ?? null,
          phone: input.phone || null,
          email: input.email || null,
          specialization: input.specialization ?? null,
          certificate: input.certificate ?? null,
          joinedAt: input.joinedAt ? parseDateOnly(input.joinedAt) : null,
          isActive: input.isActive ?? true,
          notes: input.notes ?? null,
          createdBy: meta.user.userId,
          updatedBy: meta.user.userId,
          coachSports: {
            create: sportIds.map((sportId) => ({ sportId })),
          },
        },
      });
      if (input.linkedUserId) await coachRepository.linkUser(created.id, input.linkedUserId, tx);

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: ENTITY,
          entityId: created.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: { ...created, sportIds, linkedUserId: input.linkedUserId ?? null },
        },
        tx,
      );
      const after = await coachRepository.findById(created.id, tx);
      if (!after) throw notFound('المدرب');
      return after;
    });
  },

  async update(id: string, input: UpdateCoachInput, meta: Meta): Promise<CoachWithDetails> {
    const { version, sportIds, linkedUserId, confirmDeactivation, ...data } = input;
    return prisma.$transaction(async (tx) => {
      const current = await coachRepository.findById(id, tx);
      if (!current) throw notFound('المدرب');

      // تعطيل مدرب له مجموعات نشطة — يتطلب تأكيدًا صريحًا بعد إعادة الإسناد (7.3)
      if (data.isActive === false && current.isActive) {
        const activeGroups = await coachRepository.countActiveGroups(id, tx);
        if (activeGroups > 0 && confirmDeactivation !== true) {
          throw businessRule(
            `لا يمكن تعطيل المدرب لوجود ${activeGroups} مجموعة نشطة — أعد إسناد المجموعات أو أكّد التعطيل`,
            { activeGroups, requiresConfirmation: true },
          );
        }
      }

      if (sportIds !== undefined) {
        const unique = [...new Set(sportIds)];
        if (unique.length > 0) {
          const count = await tx.sport.count({ where: { id: { in: unique }, deletedAt: null } });
          if (count !== unique.length) throw notFound('أحد الرياضات المرتبطة');
        }
        await coachRepository.setSports(id, unique, tx);
      }

      if (linkedUserId !== undefined) {
        if (linkedUserId === null) {
          await coachRepository.linkUser(id, null, tx);
        } else {
          await assertLinkableUser(linkedUserId, id, tx);
          await coachRepository.linkUser(id, linkedUserId, tx);
        }
      }

      const res = await tx.coach.updateMany({
        where: { id, version, deletedAt: null },
        data: {
          ...data,
          phone: data.phone === undefined ? undefined : data.phone || null,
          email: data.email === undefined ? undefined : data.email || null,
          joinedAt: data.joinedAt === undefined ? undefined : data.joinedAt ? parseDateOnly(data.joinedAt) : null,
          updatedBy: meta.user.userId,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw versionConflictError();

      const after = await coachRepository.findById(id, tx);
      if (!after) throw notFound('المدرب');
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
          metadata: {
            ...(sportIds !== undefined ? { sportIds } : {}),
            ...(linkedUserId !== undefined ? { linkedUserId } : {}),
            ...(confirmDeactivation === true ? { deactivationConfirmed: true } : {}),
          },
        },
        tx,
      );
      return after;
    });
  },

  /** حذف مرن — يُمنع إذا كان للمدرب مجموعات أو حصص قادمة. */
  async remove(id: string, version: number, meta: Meta): Promise<{ id: Coach['id'] }> {
    return prisma.$transaction(async (tx) => {
      const current = await coachRepository.findById(id, tx);
      if (!current) throw notFound('المدرب');

      const groups = await coachRepository.countActiveGroups(id, tx);
      const upcoming = await coachRepository.countUpcomingSessions(id, new Date(), tx);
      if (groups > 0 || upcoming > 0) {
        throw businessRule('لا يمكن حذف مدرب له مجموعات نشطة أو حصص قادمة — استخدم التعطيل', {
          activeGroups: groups,
          upcomingSessions: upcoming,
        });
      }

      await coachRepository.linkUser(id, null, tx);
      const res = await tx.coach.updateMany({
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
          before: { firstName: current.firstName, lastName: current.lastName, isActive: current.isActive },
        },
        tx,
      );
      return { id };
    });
  },
};
