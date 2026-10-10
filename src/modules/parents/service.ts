import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, businessRule, notFound } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { parentRepository, type ParentWithLinks } from './repository';
import { detectDuplicateParents, type ParentDuplicateMatch } from './duplicates';
import { computeParentDebts, type ChildDebtInput } from './debts';
import type { CreateParentInput, ParentListQuery, UpdateParentInput } from './schema';

const ENTITY = 'Parent';

type Db = typeof prisma | PrismaTransaction;

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

const big = (v: bigint): string => v.toString();

async function assertAthletesExist(athleteIds: string[], db: Db): Promise<void> {
  if (athleteIds.length === 0) return;
  const count = await parentRepository.assertAthletesExist(athleteIds, db);
  if (count !== new Set(athleteIds).size) throw notFound('أحد الرياضيين المرتبطين');
}

async function findPhoneDuplicates(
  phone: string,
  phone2: string | null | undefined,
  excludeId: string | undefined,
  db: Db,
): Promise<ParentDuplicateMatch[]> {
  const candidates = await parentRepository.findAllActiveForDuplicateCheck(db);
  return detectDuplicateParents(
    { phone, phone2: phone2 ?? null },
    candidates.filter((c) => c.id !== excludeId),
  );
}

export const parentService = {
  async list(query: ParentListQuery): Promise<{ items: ParentWithLinks[]; total: number }> {
    return parentRepository.list(query);
  },

  /** الملف الشخصي: بيانات الولي + الأبناء + إجمالي الديون (عبر shared/money). */
  async getProfile(id: string): Promise<{
    parent: ParentWithLinks;
    children: {
      athleteId: string;
      registrationNo: string;
      fullName: string;
      birthDate: Date;
      status: string;
      sportName: string | null;
      relationship: string | null;
      isPrimary: boolean;
      isPayer: boolean;
      isEmergency: boolean;
    }[];
    debts: {
      totalNet: string;
      totalPaid: string;
      totalDebt: string;
      perChild: { athleteId: string; totalNet: string; totalPaid: string; totalDebt: string }[];
    };
  }> {
    const parent = await parentRepository.findById(id);
    if (!parent) throw notFound('ولي الأمر');

    const links = await parentRepository.findChildren(id);
    const athleteIds = links.map((l) => l.athlete.id);
    const subscriptions = await parentRepository.findChildrenSubscriptions(athleteIds);
    const paidBySubscription = await parentRepository.sumNonVoidedPaymentsBySubscription(
      subscriptions.map((s) => s.id),
    );

    const perChildInput: ChildDebtInput[] = athleteIds.map((athleteId) => ({
      athleteId,
      subscriptions: subscriptions.filter((s) => s.athleteId === athleteId),
      paidBySubscription,
    }));
    const debts = computeParentDebts(perChildInput);

    return {
      parent,
      children: links.map((l) => ({
        athleteId: l.athlete.id,
        registrationNo: l.athlete.registrationNo,
        fullName: `${l.athlete.firstName} ${l.athlete.lastName}`,
        birthDate: l.athlete.birthDate,
        status: l.athlete.status,
        sportName: l.athlete.sport?.name ?? null,
        relationship: l.relationship,
        isPrimary: l.isPrimary,
        isPayer: l.isPayer,
        isEmergency: l.isEmergency,
      })),
      debts: {
        totalNet: big(debts.totalNet),
        totalPaid: big(debts.totalPaid),
        totalDebt: big(debts.totalDebt),
        perChild: debts.perChild.map((c) => ({
          athleteId: c.athleteId,
          totalNet: big(c.totalNet),
          totalPaid: big(c.totalPaid),
          totalDebt: big(c.totalDebt),
        })),
      },
    };
  },

  async create(input: CreateParentInput, meta: Meta): Promise<ParentWithLinks> {
    return prisma.$transaction(async (tx) => {
      const links = input.athletes ?? [];
      await assertAthletesExist(links.map((l) => l.athleteId), tx);

      // كشف التكرار بالهاتف — تحذير قابل للتجاوز عبر overrideDuplicate
      const matches = await findPhoneDuplicates(input.phone, input.phone2, undefined, tx);
      if (matches.length > 0 && input.overrideDuplicate !== true) {
        throw new AppError(ErrorCode.DUPLICATE_RECORD, 'يوجد ولي أمر بنفس الهاتف — راجع القائمة أو أكّد التجاوز', {
          details: { matches },
        });
      }

      const { athletes: _links, overrideDuplicate: _override, ...fields } = input;
      void _links;
      void _override;
      const created = await parentRepository.create(
        {
          ...fields,
          email: fields.email || null,
          createdBy: meta.user.userId,
          updatedBy: meta.user.userId,
          athleteParents: {
            create: links.map((l) => ({
              athleteId: l.athleteId,
              relationship: l.relationship ?? null,
              isPrimary: l.isPrimary ?? false,
              isPayer: l.isPayer ?? false,
              isEmergency: l.isEmergency ?? false,
            })),
          },
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
          after: created,
          metadata: { duplicateOverridden: matches.length > 0 },
        },
        tx,
      );
      return created;
    });
  },

  async update(id: string, input: UpdateParentInput, meta: Meta): Promise<ParentWithLinks> {
    return prisma.$transaction(async (tx) => {
      const current = await parentRepository.findById(id, {}, tx);
      if (!current) throw notFound('ولي الأمر');

      const { version, athletes: links, ...data } = input;
      if (data.phone !== undefined || data.phone2 !== undefined) {
        const matches = await findPhoneDuplicates(
          data.phone ?? current.phone,
          data.phone2 !== undefined ? data.phone2 : current.phone2,
          id,
          tx,
        );
        if (matches.length > 0) {
          throw new AppError(ErrorCode.DUPLICATE_RECORD, 'الهاتف مستخدم لولي أمر آخر', { details: { matches } });
        }
      }
      if (links) await assertAthletesExist(links.map((l) => l.athleteId), tx);

      const count = await parentRepository.updateWithVersion(
        id,
        version,
        { ...data, email: data.email === undefined ? undefined : data.email || null, updatedBy: meta.user.userId },
        tx,
      );
      if (count === 0) throw versionConflictError();
      if (links) await parentRepository.setAthleteLinks(id, links, tx);

      const after = await parentRepository.findById(id, {}, tx);
      if (!after) throw notFound('ولي الأمر');
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

  /** حذف مرن — يُمنع ما دام الولي مرتبطًا بأبناء غير محذوفين. */
  async remove(id: string, version: number, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await parentRepository.findById(id, {}, tx);
      if (!current) throw notFound('ولي الأمر');

      const links = await parentRepository.countAthleteLinks(id, tx);
      if (links > 0) {
        throw businessRule(`لا يمكن حذف ولي أمر مرتبط بـ ${links} رياضي(ين) — أزل الروابط أولًا`, { links });
      }

      const count = await parentRepository.softDelete(id, version, new Date(), meta.user.userId, tx);
      if (count === 0) throw versionConflictError();
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
