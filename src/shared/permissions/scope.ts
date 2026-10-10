import type { Prisma } from '@prisma/client';
import type { AuthContext } from '@/shared/permissions/guard';
import { hasPermission } from '@/shared/permissions/guard';

/**
 * نطاق البيانات (5.4 — الطبقة 2): يُطبَّق داخل الاستعلام نفسه وليس بتصفية لاحقة.
 * Coach لا يرى إلا مجموعاته ورياضييه. يمنع IDOR.
 */

export interface Scoped {
  userId: string;
  role: AuthContext['role'];
  linkedCoachId: string | null;
}

export function toScoped(ctx: AuthContext): Scoped {
  return { userId: ctx.userId, role: ctx.role, linkedCoachId: ctx.linkedCoachId };
}

/** هل المستخدم مقيَّد النطاق (مدرب مرتبط بحساب). */
export function isScopeRestricted(s: Scoped): boolean {
  return s.role === 'COACH' && s.linkedCoachId !== null;
}

/** معرّفات المجموعات التي يملكها المدرب المقيّد. */
export async function coachGroupIds(linkedCoachId: string): Promise<string[]> {
  const { prisma } = await import('@/shared/db/client');
  const groups = await prisma.group.findMany({
    where: { coachId: linkedCoachId, deletedAt: null },
    select: { id: true },
  });
  return groups.map((g) => g.id);
}

/**
 * يبني شرط WHERE للرياضيين حسب النطاق.
 * المدرب المقيّد: رياضيو مجموعاته النشطة فقط.
 */
export async function athleteScopeWhere(
  s: Scoped,
): Promise<Prisma.AthleteWhereInput> {
  if (!isScopeRestricted(s)) return {};
  const groupIds = await coachGroupIds(s.linkedCoachId as string);
  return {
    groupMembers: { some: { groupId: { in: groupIds }, leftAt: null } },
  };
}

/** شرط WHERE للمجموعات حسب النطاق. */
export async function groupScopeWhere(s: Scoped): Promise<Prisma.GroupWhereInput> {
  if (!isScopeRestricted(s)) return {};
  return { coachId: s.linkedCoachId as string };
}

/**
 * حارس IDOR: يتحقق أن الكيان المطلوب يقع ضمن نطاق المستخدم،
 * وإلا يرمي NOT_FOUND (لا FORBIDDEN — حتى لا نكشف الوجود).
 */
export async function assertAthleteInScope(
  s: Scoped,
  athleteId: string,
): Promise<void> {
  if (!isScopeRestricted(s)) return;
  const { prisma } = await import('@/shared/db/client');
  const groupIds = await coachGroupIds(s.linkedCoachId as string);
  const found = await prisma.athlete.findFirst({
    where: { id: athleteId, groupMembers: { some: { groupId: { in: groupIds }, leftAt: null } } },
    select: { id: true },
  });
  if (!found) {
    const { notFound } = await import('@/shared/errors');
    throw notFound('الرياضي');
  }
}

/** هل يملك المستخدم صلاحية رؤية الحقول الحساسة (6.6). */
export async function canViewSensitive(ctx: AuthContext): Promise<boolean> {
  return hasPermission(ctx, 'athletes.view_sensitive');
}
