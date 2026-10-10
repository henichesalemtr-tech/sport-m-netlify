import type { Sport } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, conflict, notFound, businessRule } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { sportRepository } from './repository';
import type { CreateSportInput, UpdateSportInput, SportListQuery } from './schema';

const ENTITY = 'Sport';

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

export const sportService = {
  async list(query: SportListQuery): Promise<{ items: Sport[]; total: number }> {
    return sportRepository.list(query);
  },

  async getById(id: string): Promise<Sport> {
    const sport = await sportRepository.findById(id);
    if (!sport) throw notFound('النشاط الرياضي');
    return sport;
  },

  async create(input: CreateSportInput, meta: Meta): Promise<Sport> {
    return prisma.$transaction(async (tx) => {
      const duplicate = await sportRepository.findByName(input.name);
      if (duplicate) throw conflict('يوجد نشاط رياضي بنفس الاسم');

      const created = await tx.sport.create({
        data: { ...input, createdBy: meta.user.userId, updatedBy: meta.user.userId },
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

  async update(id: string, input: UpdateSportInput, meta: Meta): Promise<Sport> {
    const { version, ...data } = input;
    return prisma.$transaction(async (tx) => {
      const current = await sportRepository.findById(id, tx);
      if (!current) throw notFound('النشاط الرياضي');

      if (data.name && data.name !== current.name) {
        const duplicate = await sportRepository.findByName(data.name, id, tx);
        if (duplicate) throw conflict('يوجد نشاط رياضي بنفس الاسم');
      }

      const updated = await tx.sport.updateMany({
        where: { id, version, deletedAt: null },
        data: { ...data, updatedBy: meta.user.userId, version: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw versionConflictError();
      }
      const after = await tx.sport.findFirstOrThrow({ where: { id, deletedAt: null } });
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

  /** تعطيل/تفعيل — التعطيل لا يحذف التاريخ. */
  async setActive(id: string, version: number, isActive: boolean, meta: Meta): Promise<Sport> {
    return prisma.$transaction(async (tx) => {
      const current = await sportRepository.findById(id, tx);
      if (!current) throw notFound('النشاط الرياضي');

      if (!isActive) {
        const activeGroups = await tx.group.count({
          where: { sportId: id, deletedAt: null, status: 'ACTIVE' },
        });
        if (activeGroups > 0) {
          throw businessRule(
            `لا يمكن تعطيل النشاط لوجود ${activeGroups} مجموعة نشطة — عطل المجموعات أولًا`,
            { activeGroups },
          );
        }
      }

      const res = await tx.sport.updateMany({
        where: { id, version, deletedAt: null },
        data: { isActive, updatedBy: meta.user.userId, version: { increment: 1 } },
      });
      if (res.count === 0) {
        throw versionConflictError();
      }
      const after = await tx.sport.findFirstOrThrow({ where: { id, deletedAt: null } });
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
      return after;
    });
  },

  /** حذف مرن (Soft Delete) — يُمنع إذا ارتبط بمجموعات أو رياضيين. */
  async remove(id: string, version: number, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await sportRepository.findById(id, tx);
      if (!current) throw notFound('النشاط الرياضي');

      const groups = await sportRepository.countActiveGroups(id);
      const athletes = await sportRepository.countAthletes(id);
      if (groups > 0 || athletes > 0) {
        throw businessRule('لا يمكن حذف نشاط مرتبط بمجموعات أو رياضيين — استخدم التعطيل', {
          groups,
          athletes,
        });
      }

      const res = await tx.sport.updateMany({
        where: { id, version, deletedAt: null },
        data: { deletedAt: new Date(), updatedBy: meta.user.userId, version: { increment: 1 } },
      });
      if (res.count === 0) {
        throw versionConflictError();
      }
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
};
