import { cookies } from 'next/headers';
import type { UserRole } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { getEnv } from '@/shared/config/env';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, businessRule, notFound, validationError } from '@/shared/errors';
import { hashPassword, passwordIssues, verifyPassword } from '@/shared/auth/password';
import {
  buildOtpauthUri,
  encryptTotpSecret,
  generateTotpSecret,
  totpQrDataUrl,
  verifyTotpSecret,
  verifyTotpToken,
} from '@/shared/auth/totp';
import { createSession, SESSION_COOKIE } from '@/shared/auth/session';
import type { AuthContext } from '@/shared/permissions/guard';
import { getSettings } from '@/modules/settings/service';
import { authRepository, type LoginUser } from './repository';
import type { ChangePasswordInput, LoginInput } from './schema';

export interface Meta {
  user: AuthContext | null;
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export interface SessionMeta extends Meta {
  user: AuthContext;
  sessionId: string;
}

export interface LoginResult {
  token: string;
  mustChangePassword: boolean;
  user: { id: string; fullName: string; email: string; role: UserRole };
}

const INVALID_CREDENTIALS_MESSAGE = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';

/**
 * هل التحقق الثنائي مطلوب لهذا الحساب؟
 * مربوط بإعداد auth.totpEnabled العام + تفعيله على مستوى المستخدم.
 */
export async function isTotpRequiredFor(user: Pick<LoginUser, 'totpEnabled'>): Promise<boolean> {
  if (!user.totpEnabled) return false;
  const settings = await getSettings();
  return settings.totpEnabled;
}

/**
 * التحقق من رمز TOTP مقابل السر المشفّر المخزّن — تفشل بأمان: لا تقبل أي رمز،
 * وترفض إذا غاب السر أو لم يمكن فكّ تشفيره (TOTP مهيّأ فعليًا عبر تدفق التفعيل).
 */
export function verifyTotpCode(code: string | undefined, encryptedSecret: string | null): void {
  if (!code) {
    throw new AppError(ErrorCode.VALIDATION, 'رمز التحقق الثنائي مطلوب', {
      fieldErrors: { totpCode: ['مطلوب'] },
    });
  }
  if (!/^\d{6}$/.test(code)) {
    throw new AppError(ErrorCode.VALIDATION, 'رمز التحقق غير صالح', {
      fieldErrors: { totpCode: ['يجب أن يتكون من 6 أرقام'] },
    });
  }
  if (!encryptedSecret) {
    throw businessRule('التحقق الثنائي غير مُهيّأ لهذا الحساب، تواصل مع المدير');
  }
  if (!verifyTotpToken(encryptedSecret, code)) {
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, INVALID_CREDENTIALS_MESSAGE, {
      fieldErrors: { totpCode: ['رمز التحقق غير صحيح أو منتهي الصلاحية'] },
    });
  }
}

export const authService = {
  /**
   * تسجيل الدخول مع حماية Brute-Force (قفل بعد LOGIN_MAX_ATTEMPTS
   * لمدة LOGIN_LOCKOUT_MINUTES) — 6.1.
   */
  async login(input: LoginInput, meta: Meta): Promise<LoginResult> {
    const env = getEnv();
    const now = new Date();
    const user = await authRepository.findLoginUserByEmail(input.email);

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      await writeAudit({
        userId: user?.id ?? null,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user?.id ?? undefined,
        requestId: meta.requestId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { email: input.email, reason: user ? 'account_unavailable' : 'unknown_user' },
      });
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      await writeAudit({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        requestId: meta.requestId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: 'locked', lockedUntil: user.lockedUntil.toISOString() },
      });
      throw new AppError(ErrorCode.ACCOUNT_LOCKED, 'الحساب مقفل مؤقتًا بسبب تكرار المحاولات الفاشلة', {
        details: { lockedUntil: user.lockedUntil.toISOString() },
      });
    }

    const passwordOk = await verifyPassword(user.passwordHash, input.password);
    if (!passwordOk) {
      const attempts = user.failedLoginCount + 1;
      const shouldLock = attempts >= env.LOGIN_MAX_ATTEMPTS;
      const lockedUntil = shouldLock ? new Date(now.getTime() + env.LOGIN_LOCKOUT_MINUTES * 60_000) : null;

      await prisma.$transaction(async (tx) => {
        await authRepository.registerFailedLogin(
          user.id,
          shouldLock ? 0 : attempts,
          lockedUntil,
          tx,
        );
        await writeAudit(
          {
            userId: user.id,
            action: 'LOGIN_FAILED',
            entityType: 'User',
            entityId: user.id,
            requestId: meta.requestId,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
            metadata: { attempts, locked: shouldLock, lockedUntil: lockedUntil?.toISOString() ?? null },
          },
          tx,
        );
      });

      if (shouldLock) {
        throw new AppError(ErrorCode.ACCOUNT_LOCKED, 'تم قفل الحساب مؤقتًا بسبب تكرار المحاولات الفاشلة', {
          details: { lockedUntil: lockedUntil?.toISOString() },
        });
      }
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, INVALID_CREDENTIALS_MESSAGE);
    }

    if (await isTotpRequiredFor(user)) {
      verifyTotpCode(input.totpCode, user.totpSecret);
    }

    await prisma.$transaction(async (tx) => {
      await authRepository.registerSuccessfulLogin(user.id, now, tx);
      await writeAudit(
        {
          userId: user.id,
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: { totp: user.totpEnabled },
        },
        tx,
      );
    });

    const token = await createSession(user.id, meta.ip, meta.userAgent);
    return {
      token,
      mustChangePassword: user.mustChangePassword,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
    };
  },

  /** تسجيل الخروج: إبطال الجلسة الحالية + حذف الكوكي + Audit. */
  async logout(meta: SessionMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await authRepository.revokeSessionById(meta.sessionId, tx);
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'LOGOUT',
          entityType: 'Session',
          entityId: meta.sessionId,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
        tx,
      );
    });
    cookies().delete(SESSION_COOKIE);
  },

  /** تغيير كلمة المرور بواسطة صاحب الحساب: إبطال كل الجلسات بعدها (6.1). */
  async changePassword(input: ChangePasswordInput, meta: SessionMeta): Promise<void> {
    const user = await authRepository.findLoginUserById(meta.user.userId);
    if (!user || user.deletedAt) throw notFound('المستخدم');

    const currentOk = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!currentOk) {
      await writeAudit({
        userId: user.id,
        action: 'PASSWORD_CHANGE',
        entityType: 'User',
        entityId: user.id,
        requestId: meta.requestId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { success: false, reason: 'wrong_current_password' },
      });
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'كلمة المرور الحالية غير صحيحة');
    }

    const issues = passwordIssues(input.newPassword);
    if (issues.length > 0) throw validationError({ newPassword: issues });
    if (input.newPassword === input.currentPassword) {
      throw businessRule('كلمة المرور الجديدة يجب أن تختلف عن الحالية');
    }

    const passwordHash = await hashPassword(input.newPassword);
    await prisma.$transaction(async (tx) => {
      await authRepository.setPassword(user.id, passwordHash, false, tx);
      await authRepository.revokeAllSessions(user.id, tx);
      await writeAudit(
        {
          userId: user.id,
          action: 'PASSWORD_CHANGE',
          entityType: 'User',
          entityId: user.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: { success: true, self: true },
        },
        tx,
      );
    });
    cookies().delete(SESSION_COOKIE);
  },

  /**
   * إعادة ضبط كلمة المرور بواسطة مدير (users.manage):
   * mustChangePassword=true + إبطال كل جلسات الهدف.
   */
  async adminResetPassword(targetUserId: string, newPassword: string, meta: Meta): Promise<void> {
    const target = await authRepository.findLoginUserById(targetUserId);
    if (!target || target.deletedAt) throw notFound('المستخدم');

    const issues = passwordIssues(newPassword);
    if (issues.length > 0) throw validationError({ newPassword: issues });

    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      await authRepository.setPassword(target.id, passwordHash, true, tx);
      await authRepository.revokeAllSessions(target.id, tx);
      await writeAudit(
        {
          userId: meta.user?.userId ?? null,
          action: 'PASSWORD_CHANGE',
          entityType: 'User',
          entityId: target.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: { success: true, adminReset: true },
        },
        tx,
      );
    });
  },

  /**
   * بدء تهيئة TOTP لصاحب الحساب: توليد سر خام + رابط otpauth + QR.
   * لا يُخزَّن شيء حتى يتحقق enable من رمز صالح (يمنع تفعيلًا بغير تأكيد).
   */
  async setupTotp(meta: SessionMeta): Promise<{ secret: string; otpauthUri: string; qrDataUrl: string }> {
    const user = await authRepository.findLoginUserById(meta.user.userId);
    if (!user || user.deletedAt) throw notFound('المستخدم');
    if (user.totpEnabled) throw businessRule('التحقق الثنائي مُفعّل بالفعل');

    // نفس البوابة التي يتحقق منها تسجيل الدخول (isTotpRequiredFor).
    const settings = await getSettings();
    if (!settings.totpEnabled) throw businessRule('التحقق الثنائي معطّل على مستوى النظام');

    const secret = generateTotpSecret();
    const otpauthUri = buildOtpauthUri(secret, user.email, settings.orgName);
    const qrDataUrl = await totpQrDataUrl(otpauthUri);
    await writeAudit({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'User',
      entityId: user.id,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { totpSetup: true },
    });
    return { secret, otpauthUri, qrDataUrl };
  },

  /** تفعيل TOTP: التحقق من الرمز مقابل السر الخام ثم تخزينه مشفّرًا. */
  async enableTotp(input: { secret: string; code: string }, meta: SessionMeta): Promise<void> {
    const user = await authRepository.findLoginUserById(meta.user.userId);
    if (!user || user.deletedAt) throw notFound('المستخدم');
    if (user.totpEnabled) throw businessRule('التحقق الثنائي مُفعّل بالفعل');

    if (!verifyTotpSecret(input.code, input.secret)) {
      throw validationError({ code: ['رمز التحقق غير صحيح — أعد المسح وحاول مجددًا'] });
    }

    const encrypted = encryptTotpSecret(input.secret);
    await prisma.$transaction(async (tx) => {
      await authRepository.setTotpSecret(user.id, encrypted, tx);
      await writeAudit(
        {
          userId: user.id,
          action: 'UPDATE',
          entityType: 'User',
          entityId: user.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: { totpEnabled: true },
        },
        tx,
      );
    });
  },

  /** تعطيل TOTP: يتطلب رمزًا حاليًا صحيحًا للتأكيد، ثم مسح السر. */
  async disableTotp(input: { code: string }, meta: SessionMeta): Promise<void> {
    const user = await authRepository.findLoginUserById(meta.user.userId);
    if (!user || user.deletedAt) throw notFound('المستخدم');
    if (!user.totpEnabled) throw businessRule('التحقق الثنائي غير مُفعّل');
    if (!verifyTotpToken(user.totpSecret, input.code)) {
      throw validationError({ code: ['رمز التحقق غير صحيح'] });
    }

    await prisma.$transaction(async (tx) => {
      await authRepository.clearTotpSecret(user.id, tx);
      await writeAudit(
        {
          userId: user.id,
          action: 'UPDATE',
          entityType: 'User',
          entityId: user.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: { totpEnabled: false },
        },
        tx,
      );
    });
  },
};
