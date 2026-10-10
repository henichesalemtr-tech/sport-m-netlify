import { cookies } from 'next/headers';
import { prisma } from '@/shared/db/client';
import { getEnv } from '@/shared/config/env';
import { randomToken, sha256 } from './password';
import type { AuthContext } from '@/shared/permissions/guard';
import { AppError, ErrorCode } from '@/shared/errors';

export const SESSION_COOKIE = 'sms_session';

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: getEnv().NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * إنشاء جلسة جديدة مع تدوير المعرّف (6.1). تُخزَّن تجزئة الرمز فقط.
 */
export async function createSession(userId: string, ip?: string, userAgent?: string) {
  const env = getEnv();
  const token = randomToken(32);
  const now = new Date();
  const idleExp = new Date(now.getTime() + env.SESSION_IDLE_MINUTES * 60_000);
  const absExp = new Date(now.getTime() + env.SESSION_ABSOLUTE_HOURS * 3_600_000);

  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), ipAddress: ip, userAgent, expiresAt: idleExp, absoluteExp: absExp },
  });

  cookies().set(SESSION_COOKIE, token, cookieOptions(env.SESSION_IDLE_MINUTES * 60));
  return token;
}

/** قراءة الجلسة الحالية من الكوكي والتحقق من الصلاحية مع تمديد الخمول. */
export async function getSession(): Promise<(AuthContext & { sessionId: string }) | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const env = getEnv();
  const now = new Date();

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt) return null;
  if (session.absoluteExp < now || session.expiresAt < now) {
    await revokeSession(session.id);
    return null;
  }
  if (session.user.status !== 'ACTIVE' || session.user.deletedAt) {
    await revokeSession(session.id);
    return null;
  }

  // تمديد انتهاء الخمول
  const newIdle = new Date(now.getTime() + env.SESSION_IDLE_MINUTES * 60_000);
  await prisma.session.update({ where: { id: session.id }, data: { expiresAt: newIdle } });

  return {
    sessionId: session.id,
    userId: session.user.id,
    role: session.user.role,
    email: session.user.email,
    fullName: session.user.fullName,
    linkedCoachId: session.user.linkedCoachId,
  };
}

export async function revokeSession(sessionId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  cookies().delete(SESSION_COOKIE);
}

/** إبطال كل جلسات مستخدم (عند تعطيله/تغيير كلمة المرور/تغيير الدور) — 6.1 */
export async function revokeAllUserSessions(userId: string) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function requireSession(): Promise<AuthContext & { sessionId: string }> {
  const ctx = await getSession();
  if (!ctx) throw new AppError(ErrorCode.UNAUTHORIZED, 'انتهت الجلسة، يرجى تسجيل الدخول');
  return ctx;
}
