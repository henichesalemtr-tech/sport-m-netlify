/**
 * قواعد نقية لحماية آخر مدير عام (SUPER_ADMIN) — قابلة للاختبار دون قاعدة بيانات.
 * "مدير عام فعّال" = دوره SUPER_ADMIN وحالته ACTIVE وغير محذوف.
 */
import type { UserRole, UserStatus } from '@prisma/client';

export interface SuperAdminState {
  role: UserRole;
  status: UserStatus;
  deletedAt: Date | null;
}

/** هل المستخدم مدير عام فعّال (يحتسب ضمن عدد المديرين العامين)؟ */
export function isEffectiveSuperAdmin(state: SuperAdminState): boolean {
  return state.role === 'SUPER_ADMIN' && state.status === 'ACTIVE' && state.deletedAt === null;
}

/**
 * هل الانتقال من الحالة `before` إلى `after` يزيل آخر مدير عام فعّال؟
 * @param effectiveSuperAdminCount عدد المديرين العامين الفعّالين حاليًا (يشمل الهدف إن كان فعّالًا).
 */
export function wouldRemoveLastSuperAdmin(
  before: SuperAdminState,
  after: SuperAdminState,
  effectiveSuperAdminCount: number,
): boolean {
  if (!isEffectiveSuperAdmin(before)) return false;
  if (isEffectiveSuperAdmin(after)) return false;
  return effectiveSuperAdminCount <= 1;
}
