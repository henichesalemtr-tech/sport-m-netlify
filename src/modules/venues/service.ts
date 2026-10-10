import type { Venue } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, businessRule, conflict, notFound } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { venueRepository } from './repository';
import type { CreateVenueInput, UpdateVenueInput, VenueListQuery } from './schema';

const ENTITY = 'Venue';

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

export const venueService = {
  async list(query: VenueListQuery): Promise<{ items: Venue[]; total: number }> {
    return venueRepository.list(query);
  },

  async getById(id: string): Promise<Venue> {
    const venue = await venueRepository.findById(id);
    if (!venue) throw notFound('القاعة/الملعب');
    return venue;
  },

  async create(input: CreateVenueInput, meta: Meta): Promise<Venue> {
    return prisma.$transaction(async (tx) => {
      const duplicate = await venueRepository.findByName(input.name, undefined, tx);
      if (duplicate) throw conflict('توجد قاعة/ملعب بنفس الاسم');

      const created = await tx.venue.create({
        data: {
          ...input,
          capacity: input.capacity ?? null,
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
      return created;
    });
  },

  async update(id: string, input: UpdateVenueInput, meta: Meta): Promise<Venue> {
    const { version, ...data } = input;
    return prisma.$transaction(async (tx) => {
      const current = await venueRepository.findById(id, tx);
      if (!current) throw notFound('القاعة/الملعب');

      if (data.name && data.name !== current.name) {
        const duplicate = await venueRepository.findByName(data.name, id, tx);
        if (duplicate) throw conflict('توجد قاعة/ملعب بنفس الاسم');
      }

      const updated = await tx.venue.updateMany({
        where: { id, version, deletedAt: null },
        data: { ...data, updatedBy: meta.user.userId, version: { increment: 1 } },
      });
      if (updated.count === 0) throw versionConflictError();
      const after = await tx.venue.findFirstOrThrow({ where: { id, deletedAt: null } });
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

  /** حذف مرن — يُمنع عند وجود مجموعات مرتبطة أو حصص قادمة. */
  async remove(id: string, version: number, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await venueRepository.findById(id, tx);
      if (!current) throw notFound('القاعة/الملعب');

      const groups = await venueRepository.countGroups(id);
      const upcoming = await venueRepository.countUpcomingSessions(id, new Date());
      if (groups > 0 || upcoming > 0) {
        throw businessRule(
          'لا يمكن حذف قاعة/ملعب مرتبط بمجموعات أو حصص قادمة — غيّر الحالة إلى CLOSED',
          { groups, upcomingSessions: upcoming },
        );
      }

      const res = await tx.venue.updateMany({
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
};
