import type { UserRole } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { AppError, ErrorCode, forbidden } from '@/shared/errors';
import { perm, roleHasPermissionDefault, type ModuleName } from './catalog';

export interface AuthContext {
  userId: string;
  role: UserRole;
  email: string;
  fullName: string;
  linkedCoachId: string | null;
}

/**
 * صلاحيات المستخدم الفعلية = الافتراضية للدور ± تخصيصات DB (user_role_permissions).
 * تُخزَّن في الذاكرة المؤقتة للطلب الواحد.
 */
export async function resolvePermissions(role: UserRole): Promise<Set<string>> {
  const set = new Set<string>();
  const all = await prisma.permission.findMany({ select: { code: true } });
  for (const { code } of all) {
    if (roleHasPermissionDefault(role, code)) set.add(code);
  }
  const overrides = await prisma.userRolePermission.findMany({
    where: { role },
    include: { permission: { select: { code: true } } },
  });
  for (const o of overrides) {
    if (o.granted) set.add(o.permission.code);
    else set.delete(o.permission.code);
  }
  return set;
}

export async function hasPermission(ctx: AuthContext, code: string): Promise<boolean> {
  const perms = await resolvePermissions(ctx.role);
  return perms.has(code);
}

/**
 * حاجز التفويض المركزي — يُستدعى في الـ Controller قبل أي منطق (5.4).
 * يرمي FORBIDDEN/INSUFFICIENT_PERMISSION عند الفشل.
 */
export async function requirePermission(ctx: AuthContext, code: string): Promise<void> {
  const ok = await hasPermission(ctx, code);
  if (!ok) {
    throw new AppError(
      ErrorCode.INSUFFICIENT_PERMISSION,
      'ليست لديك الصلاحية المطلوبة لهذه العملية',
      { details: { required: code } },
    );
  }
}

export async function requireModuleAction(
  ctx: AuthContext,
  module: ModuleName,
  action: string,
): Promise<void> {
  return requirePermission(ctx, perm(module, action));
}

export function assertAuthenticated(ctx: AuthContext | null): asserts ctx is AuthContext {
  if (!ctx) throw forbidden('يجب تسجيل الدخول');
}
