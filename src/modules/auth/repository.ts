import { prisma, type PrismaTransaction } from '@/shared/db/client';
import type { UserRole, UserStatus } from '@prisma/client';

type Db = typeof prisma | PrismaTransaction;

export interface LoginUser {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  deletedAt: Date | null;
  totpEnabled: boolean;
  totpSecret: string | null;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  linkedCoachId: string | null;
}

const LOGIN_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  passwordHash: true,
  role: true,
  status: true,
  deletedAt: true,
  totpEnabled: true,
  totpSecret: true,
  mustChangePassword: true,
  failedLoginCount: true,
  lockedUntil: true,
  linkedCoachId: true,
} as const;

/** استعلامات المصادقة — Prisma فقط (4.2). */
export const authRepository = {
  findLoginUserByEmail(email: string, db: Db = prisma): Promise<LoginUser | null> {
    return db.user.findFirst({ where: { email }, select: LOGIN_USER_SELECT });
  },

  findLoginUserById(id: string, db: Db = prisma): Promise<LoginUser | null> {
    return db.user.findFirst({ where: { id }, select: LOGIN_USER_SELECT });
  },

  async registerFailedLogin(
    userId: string,
    failedLoginCount: number,
    lockedUntil: Date | null,
    db: Db = prisma,
  ): Promise<void> {
    await db.user.update({ where: { id: userId }, data: { failedLoginCount, lockedUntil } });
  },

  async registerSuccessfulLogin(userId: string, now: Date, db: Db = prisma): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
  },

  async setPassword(
    userId: string,
    passwordHash: string,
    mustChangePassword: boolean,
    db: Db = prisma,
  ): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword, version: { increment: 1 } },
    });
  },

  async revokeAllSessions(userId: string, db: Db = prisma): Promise<void> {
    await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  async revokeSessionById(sessionId: string, db: Db = prisma): Promise<void> {
    await db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  /** تفعيل TOTP: تخزين السر مشفّرًا + رفع العلم + إبطال الجلسات الأخرى اختيارية في الخدمة. */
  async setTotpSecret(userId: string, encryptedSecret: string, db: Db = prisma): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: { totpEnabled: true, totpSecret: encryptedSecret, version: { increment: 1 } },
    });
  },

  /** تعطيل TOTP: مسح السر وخفض العلم. */
  async clearTotpSecret(userId: string, db: Db = prisma): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null, version: { increment: 1 } },
    });
  },
};
