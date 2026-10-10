import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, businessRule, conflict, notFound, validationError } from '@/shared/errors';
import { hashPassword, passwordIssues } from '@/shared/auth/password';
import type { Meta } from '@/shared/api/meta';
import type { AuthContext } from '@/shared/permissions/guard';
import { authService } from '@/modules/auth/service';
import { userRepository, type SafeUser, type SessionRow } from './repository';
import { wouldRemoveLastSuperAdmin } from './policy';
import type {
  ChangeRoleInput,
  CreateUserInput,
  RevokeSessionsInput,
  SetUserStatusInput,
  UpdateUserInput,
  UserListQuery,
} from './schema';

const ENTITY = 'User';

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

const lastSuperAdminError = () =>
  new AppError(ErrorCode.LAST_SUPER_ADMIN, 'لا يمكن تنفيذ العملية — هذا آخر مدير عام فعّال في النظام');

export interface UserSessionDto extends SessionRow {
  isCurrent: boolean;
}

type Db = typeof prisma | PrismaTransaction;

async function assertEmailAvailable(email: string, excludeId: string | undefined, tx: Db): Promise<void> {
  const dup = await userRepository.findByEmail(email, excludeId, tx);
  if (dup) throw conflict('البريد الإلكتروني مستخدم مسبقًا');
}

async function assertUsernameAvailable(
  username: string | undefined,
  excludeId: string | undefined,
  tx: Db,
): Promise<void> {
  if (!username) return;
  const dup = await userRepository.findByUsername(username, excludeId, tx);
  if (dup) throw conflict('اسم المستخدم مستخدم مسبقًا');
}

/** حماية آخر مدير عام: ترمي LAST_SUPER_ADMIN إن كانت العملية ستزيل آخر مدير عام فعّال. */
async function guardLastSuperAdmin(
  current: SafeUser,
  next: { role?: SafeUser['role']; status?: SafeUser['status']; deletedAt?: Date | null },
  tx: Db,
): Promise<void> {
  const before = { role: current.role, status: current.status, deletedAt: current.deletedAt };
  const after = {
    role: next.role ?? current.role,
    status: next.status ?? current.status,
    deletedAt: next.deletedAt === undefined ? current.deletedAt : next.deletedAt,
  };
  if (before.role !== after.role || before.status !== after.status || before.deletedAt !== after.deletedAt) {
    const count = await userRepository.countEffectiveSuperAdmins(tx);
    if (wouldRemoveLastSuperAdmin(before, after, count)) throw lastSuperAdminError();
  }
}

export const userService = {
  async list(query: UserListQuery): Promise<{ items: SafeUser[]; total: number }> {
    return userRepository.list(query);
  },

  async getById(id: string): Promise<SafeUser> {
    const user = await userRepository.findSafeById(id);
    if (!user) throw notFound('المستخدم');
    return user;
  },

  async create(input: CreateUserInput, meta: Meta): Promise<SafeUser> {
    const issues = passwordIssues(input.password);
    if (issues.length > 0) throw validationError({ password: issues });

    return prisma.$transaction(async (tx) => {
      await assertEmailAvailable(input.email, undefined, tx);
      await assertUsernameAvailable(input.username, undefined, tx);
      if (input.linkedCoachId) {
        const coach = await tx.coach.findFirst({ where: { id: input.linkedCoachId, deletedAt: null } });
        if (!coach) throw notFound('المدرب المرتبط');
      }

      const passwordHash = await hashPassword(input.password);
      const created = await userRepository.create(
        {
          email: input.email,
          username: input.username ?? null,
          fullName: input.fullName,
          passwordHash,
          role: input.role,
          linkedCoachId: input.linkedCoachId ?? null,
          mustChangePassword: input.mustChangePassword ?? true,
          createdBy: meta.user.userId,
          updatedBy: meta.user.userId,
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
        },
        tx,
      );
      return created;
    });
  },

  /** تحديث البيانات الأساسية (بدون الدور/الحالة — لهما عمليتان مخصصتان). */
  async update(id: string, input: UpdateUserInput, meta: Meta): Promise<SafeUser> {
    const { version, ...data } = input;
    return prisma.$transaction(async (tx) => {
      const current = await userRepository.findSafeById(id, tx);
      if (!current) throw notFound('المستخدم');
      if (data.email !== undefined && data.email !== current.email) {
        await assertEmailAvailable(data.email, id, tx);
      }
      await assertUsernameAvailable(data.username ?? undefined, id, tx);

      const count = await userRepository.updateWithVersion(
        id,
        version,
        { ...data, updatedBy: meta.user.userId },
        tx,
      );
      if (count === 0) throw versionConflictError();
      const after = await userRepository.findSafeById(id, tx);
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
      if (!after) throw notFound('المستخدم');
      return after;
    });
  },

  /**
   * تغيير الدور: ممنوع تغيير دور النفس (منع التصعيد الذاتي)،
   * وممنوع إزالة آخر مدير عام فعّال (LAST_SUPER_ADMIN).
   */
  async changeRole(id: string, input: ChangeRoleInput, meta: Meta): Promise<SafeUser> {
    if (id === meta.user.userId) {
      throw businessRule('لا يمكنك تغيير دورك بنفسك — اطلب من مدير عام آخر');
    }
    return prisma.$transaction(async (tx) => {
      const current = await userRepository.findSafeById(id, tx);
      if (!current) throw notFound('المستخدم');
      await guardLastSuperAdmin(current, { role: input.role }, tx);

      const count = await userRepository.updateWithVersion(
        id,
        input.version,
        { role: input.role, updatedBy: meta.user.userId },
        tx,
      );
      if (count === 0) throw versionConflictError();

      // إبطال جلسات المتأثر حتى تسري صلاحياته الجديدة فورًا (6.1)
      await userRepository.revokeAllSessions(id, tx);

      const after = await userRepository.findSafeById(id, tx);
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'ROLE_CHANGE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { role: current.role },
          after: { role: input.role },
        },
        tx,
      );
      if (!after) throw notFound('المستخدم');
      return after;
    });
  },

  /** تفعيل/تعطيل: التعطيل يبطل كل الجلسات، وممنوع تعطيل النفس أو آخر مدير عام. */
  async setStatus(id: string, input: SetUserStatusInput, meta: Meta): Promise<SafeUser> {
    if (input.status === 'DISABLED' && id === meta.user.userId) {
      throw businessRule('لا يمكنك تعطيل حسابك بنفسك');
    }
    return prisma.$transaction(async (tx) => {
      const current = await userRepository.findSafeById(id, tx);
      if (!current) throw notFound('المستخدم');
      if (input.status === 'DISABLED') {
        await guardLastSuperAdmin(current, { status: 'DISABLED' }, tx);
      }

      const count = await userRepository.updateWithVersion(
        id,
        input.version,
        { status: input.status, updatedBy: meta.user.userId },
        tx,
      );
      if (count === 0) throw versionConflictError();

      if (input.status === 'DISABLED') {
        await userRepository.revokeAllSessions(id, tx);
      }

      const after = await userRepository.findSafeById(id, tx);
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { status: current.status },
          after: { status: input.status },
          metadata: { operation: input.status === 'DISABLED' ? 'disable' : 'enable' },
        },
        tx,
      );
      if (!after) throw notFound('المستخدم');
      return after;
    });
  },

  /** حذف مرن: ممنوع حذف النفس أو آخر مدير عام، وتُبطل كل الجلسات. */
  async remove(id: string, version: number, meta: Meta): Promise<{ id: string }> {
    if (id === meta.user.userId) {
      throw businessRule('لا يمكنك حذف حسابك بنفسك');
    }
    return prisma.$transaction(async (tx) => {
      const current = await userRepository.findSafeById(id, tx);
      if (!current) throw notFound('المستخدم');
      await guardLastSuperAdmin(current, { deletedAt: new Date() }, tx);

      const count = await userRepository.updateWithVersion(
        id,
        version,
        { deletedAt: new Date(), updatedBy: meta.user.userId },
        tx,
      );
      if (count === 0) throw versionConflictError();
      await userRepository.revokeAllSessions(id, tx);

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

  /** إعادة ضبط كلمة المرور بواسطة مدير — يفوّض لخدمة المصادقة (mustChangePassword + إبطال الجلسات). */
  async resetPassword(id: string, newPassword: string, meta: Meta): Promise<void> {
    const target = await userRepository.findSafeById(id);
    if (!target) throw notFound('المستخدم');
    await authService.adminResetPassword(id, newPassword, meta);
  },

  /** الجلسات النشطة للمستخدم مع تمييز الجلسة الحالية. */
  async listSessions(id: string, currentSessionId: string | undefined): Promise<UserSessionDto[]> {
    const user = await userRepository.findSafeById(id);
    if (!user) throw notFound('المستخدم');
    const sessions = await userRepository.listActiveSessions(id, new Date());
    return sessions.map((s) => ({ ...s, isCurrent: s.id === currentSessionId }));
  },

  /** إبطال جلسة محددة أو كل جلسات المستخدم. */
  async revokeSessions(
    id: string,
    input: RevokeSessionsInput,
    meta: Meta & { user: AuthContext },
  ): Promise<{ revoked: number }> {
    return prisma.$transaction(async (tx) => {
      const user = await userRepository.findSafeById(id, tx);
      if (!user) throw notFound('المستخدم');

      const revoked = input.sessionId
        ? await userRepository.revokeSessionById(input.sessionId, id, tx)
        : await userRepository.revokeAllSessions(id, tx);
      if (input.sessionId && revoked === 0) throw notFound('الجلسة');

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: 'Session',
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: { operation: 'revoke', targetUserId: id, sessionId: input.sessionId ?? null, revoked },
        },
        tx,
      );
      return { revoked };
    });
  },
};
