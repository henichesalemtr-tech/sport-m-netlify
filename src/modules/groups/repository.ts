import type { Group, GroupMember, Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { normalizeArabic, escapeLike } from '@/shared/text/normalize';
import { groupScopeWhere, toScoped, type Scoped } from '@/shared/permissions/scope';
import type { AuthContext } from '@/shared/permissions/guard';
import type { GroupListQuery, MemberListQuery } from './schema';

const SORTABLE = ['name', 'code', 'maxCapacity', 'createdAt', 'status'];

export const GROUP_INCLUDE = {
  sport: { select: { id: true, name: true, color: true } },
  ageCategory: { select: { id: true, name: true, kind: true, minAge: true, maxAge: true } },
  coach: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
  venue: { select: { id: true, name: true, type: true, status: true } },
} satisfies Prisma.GroupInclude;

export type GroupWithDetails = Prisma.GroupGetPayload<{ include: typeof GROUP_INCLUDE }>;

export type MemberRow = GroupMember & {
  athlete: {
    id: string;
    registrationNo: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    birthDate: Date;
    status: string;
    ageCategory: { id: string; name: string } | null;
  };
};

export type ActiveMembershipWithGroup = GroupMember & {
  group: { id: string; name: string; sportId: string };
};

type Db = typeof prisma | PrismaTransaction;

export const groupRepository = {
  async list(query: GroupListQuery, user: AuthContext): Promise<{ items: GroupWithDetails[]; total: number }> {
    const scope: Scoped = toScoped(user);
    const where: Prisma.GroupWhereInput = {
      deletedAt: null,
      ...(await groupScopeWhere(scope)),
    };
    if (query.sportId) where.sportId = query.sportId;
    if (query.coachId) where.coachId = query.coachId;
    if (query.venueId) where.venueId = query.venueId;
    if (query.ageCategoryId) where.ageCategoryId = query.ageCategoryId;
    if (query.status) where.status = query.status;
    if (query.q) {
      const q = escapeLike(normalizeArabic(query.q));
      where.OR = [
        { name: { contains: query.q } },
        { code: { contains: query.q } },
        { name: { contains: q } },
      ];
    }
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.group.findMany({
        where,
        include: GROUP_INCLUDE,
        orderBy: orderBy.length > 0 ? orderBy : [{ name: 'asc' }],
        ...pagination(query),
      }),
      prisma.group.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<GroupWithDetails | null> {
    const client: Db = tx ?? prisma;
    return client.group.findFirst({ where: { id, deletedAt: null }, include: GROUP_INCLUDE });
  },

  async findByCode(code: string, excludeId?: string, tx?: PrismaTransaction): Promise<Group | null> {
    const client: Db = tx ?? prisma;
    return client.group.findFirst({
      where: {
        deletedAt: null,
        code: { equals: code },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  /**
   * قفل صف المجموعة (SELECT ... FOR UPDATE) داخل Transaction — 7.6.
   * يضمن تسلسل فحوص السعة المتزامنة على نفس المجموعة.
   */
  async lockGroupForUpdate(id: string, tx: PrismaTransaction): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM \`groups\` WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE
    `;
    return rows.length > 0;
  },

  async countActiveMembers(groupId: string, tx?: PrismaTransaction): Promise<number> {
    const client: Db = tx ?? prisma;
    return client.groupMember.count({ where: { groupId, leftAt: null } });
  },

  async findActiveMembership(
    groupId: string,
    athleteId: string,
    tx?: PrismaTransaction,
  ): Promise<GroupMember | null> {
    const client: Db = tx ?? prisma;
    return client.groupMember.findFirst({ where: { groupId, athleteId, leftAt: null } });
  },

  /** كل عضويات الرياضي النشطة (لتحذيرات الازدواجية وسياق التحويل). */
  async findActiveMembershipsOfAthlete(
    athleteId: string,
    tx?: PrismaTransaction,
  ): Promise<ActiveMembershipWithGroup[]> {
    const client: Db = tx ?? prisma;
    return client.groupMember.findMany({
      where: { athleteId, leftAt: null },
      include: { group: { select: { id: true, name: true, sportId: true } } },
    });
  },

  async listMembers(
    groupId: string,
    query: MemberListQuery,
  ): Promise<{ items: MemberRow[]; total: number }> {
    const where: Prisma.GroupMemberWhereInput = { groupId };
    if (query.active === 'true') where.leftAt = null;
    if (query.active === 'false') where.leftAt = { not: null };
    if (query.q) {
      const q = escapeLike(normalizeArabic(query.q));
      where.athlete = {
        OR: [
          { firstName: { contains: query.q } },
          { lastName: { contains: query.q } },
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { registrationNo: { contains: query.q } },
        ],
      };
    }
    const orderBy = toOrderBy(query.sort, ['joinedAt', 'leftAt']);
    const [items, total] = await prisma.$transaction([
      prisma.groupMember.findMany({
        where,
        include: {
          athlete: {
            select: {
              id: true,
              registrationNo: true,
              firstName: true,
              lastName: true,
              photoUrl: true,
              birthDate: true,
              status: true,
              ageCategory: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: orderBy.length > 0 ? orderBy : [{ joinedAt: 'asc' }],
        ...pagination(query),
      }),
      prisma.groupMember.count({ where }),
    ]);
    return { items, total };
  },

  async findMemberById(id: string, tx?: PrismaTransaction): Promise<GroupMember | null> {
    const client: Db = tx ?? prisma;
    return client.groupMember.findFirst({ where: { id } });
  },

  async createMember(
    data: {
      groupId: string;
      athleteId: string;
      joinedAt: Date;
      createdBy: string;
    },
    tx: PrismaTransaction,
  ): Promise<GroupMember> {
    return tx.groupMember.create({ data });
  },

  async closeMembership(
    id: string,
    leftAt: Date,
    leaveReason: string,
    tx: PrismaTransaction,
  ): Promise<void> {
    await tx.groupMember.update({ where: { id }, data: { leftAt, leaveReason } });
  },
};
