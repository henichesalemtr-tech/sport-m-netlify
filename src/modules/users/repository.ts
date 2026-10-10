import type { Prisma, User } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import type { UserListQuery } from './schema';

type Db = typeof prisma | PrismaTransaction;

const SORTABLE = ['email', 'fullName', 'role', 'status', 'createdAt', 'lastLoginAt'];

/** أعمدة المستخدم الآمنة (بدون أسرار) — تُستخدم في القوائم والتفاصيل. */
export const USER_SAFE_SELECT = {
  id: true,
  email: true,
  username: true,
  fullName: true,
  role: true,
  status: true,
  mustChangePassword: true,
  totpEnabled: true,
  lastLoginAt: true,
  failedLoginCount: true,
  lockedUntil: true,
  linkedCoachId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  deletedAt: true,
  version: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof USER_SAFE_SELECT }>;

/** أعمدة كاملة (تشمل الأسرار) — للاستخدام الداخلي في الخدمة فقط. */
export type FullUser = User;

export interface SessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  absoluteExp: Date;
}

export interface UserListResult {
  items: SafeUser[];
  total: number;
}

function buildWhere(query: UserListQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { deletedAt: null };
  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;
  if (query.q) {
    where.OR = [
      { email: { contains: query.q, mode: 'insensitive' } },
      { username: { contains: query.q, mode: 'insensitive' } },
      { fullName: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/** استعلامات المستخدمين — Prisma فقط (4.2). */
export const userRepository = {
  async list(query: UserListQuery): Promise<UserListResult> {
    const where = buildWhere(query);
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        orderBy: orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  },

  findSafeById(id: string, db: Db = prisma): Promise<SafeUser | null> {
    return db.user.findFirst({ where: { id, deletedAt: null }, select: USER_SAFE_SELECT });
  },

  /** الصف الكامل (يشمل passwordHash) — للتحقق الداخلي وحماية آخر مدير عام. */
  findFullById(id: string, db: Db = prisma): Promise<FullUser | null> {
    return db.user.findFirst({ where: { id } });
  },

  findByEmail(email: string, excludeId: string | undefined, db: Db = prisma): Promise<SafeUser | null> {
    return db.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: USER_SAFE_SELECT,
    });
  },

  findByUsername(username: string, excludeId: string | undefined, db: Db = prisma): Promise<SafeUser | null> {
    return db.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: USER_SAFE_SELECT,
    });
  },

  /** عدد المديرين العامين الفعّالين (ACTIVE وغير محذوفين). */
  countEffectiveSuperAdmins(db: Db = prisma): Promise<number> {
    return db.user.count({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE', deletedAt: null },
    });
  },

  create(data: Prisma.UserCreateInput, db: Db = prisma): Promise<SafeUser> {
    return db.user.create({ data, select: USER_SAFE_SELECT });
  },

  /** تحديث بتحقق Version (التعديل المتزامن — 4.2/8). يعيد عدد الصفوف المتأثرة. */
  async updateWithVersion(
    id: string,
    version: number,
    data: Prisma.UserUncheckedUpdateInput,
    db: Db = prisma,
  ): Promise<number> {
    const res = await db.user.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    return res.count;
  },

  listActiveSessions(userId: string, now: Date, db: Db = prisma): Promise<SessionRow[]> {
    return db.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now }, absoluteExp: { gt: now } },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        absoluteExp: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async revokeSessionById(sessionId: string, userId: string, db: Db = prisma): Promise<number> {
    const res = await db.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count;
  },

  async revokeAllSessions(userId: string, db: Db = prisma): Promise<number> {
    const res = await db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count;
  },
};
