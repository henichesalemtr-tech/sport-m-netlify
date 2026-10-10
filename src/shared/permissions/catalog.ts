/**
 * كتالوج الصلاحيات الدقيقة (5.2) والمصفوفة الافتراضية (5.3).
 * ممنوع فحص الأدوار بنصوص صلبة — نستخدم Permissions عبر طبقة مركزية (2.2).
 */
import type { UserRole } from '@prisma/client';

export const PERMISSIONS = {
  athletes: ['view', 'create', 'edit', 'delete', 'restore', 'export', 'import', 'view_sensitive'],
  parents: ['view', 'create', 'edit', 'delete'],
  sports: ['view', 'manage'],
  age_categories: ['view', 'manage'],
  venues: ['view', 'manage'],
  groups: ['view', 'create', 'edit', 'delete', 'manage_members', 'override_capacity'],
  coaches: ['view', 'create', 'edit', 'delete'],
  sessions: ['view', 'create', 'edit', 'delete'],
  attendance: ['view', 'create', 'edit', 'edit_past'],
  evaluations: ['view', 'create', 'edit'],
  documents: ['view', 'upload', 'delete'],
  subscriptions: ['view', 'create', 'edit', 'delete', 'apply_discount', 'suspend', 'cancel'],
  payments: ['view', 'create', 'void', 'refund', 'reprint_receipt'],
  expenses: ['view', 'create', 'edit', 'delete', 'export'],
  cash: ['view', 'adjust', 'close_day'],
  reports: ['view', 'view_finance', 'export'],
  notifications: ['view', 'manage'],
  users: ['manage'],
  roles: ['manage'],
  settings: ['manage'],
  audit: ['view'],
  backup: ['manage'],
} as const;

export type ModuleName = keyof typeof PERMISSIONS;
export type PermissionCode = string; // `${module}.${action}`

export function perm(module: ModuleName, action: string): PermissionCode {
  return `${module}.${action}`;
}

export function allPermissionCodes(): PermissionCode[] {
  return Object.entries(PERMISSIONS).flatMap(([mod, actions]) =>
    (actions as readonly string[]).map((a) => `${mod}.${a}`),
  );
}

/**
 * المصفوفة الافتراضية (5.3). 'own' تعني ضمن نطاق بيانات المستخدم (تُطبَّق في الـ Repository).
 * هذه قيم Seed قابلة للتخصيص من Super Admin؛ ليست صلبة في منطق التفويض.
 */
type Grant = 'all' | 'own' | PermissionCode[] | 'none';

const V = (m: ModuleName) => perm(m, 'view');

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionCode[] | 'ALL'> = {
  SUPER_ADMIN: 'ALL',
  ADMIN: 'ALL',
  RECEPTION: [
    'athletes.view', 'athletes.create', 'athletes.edit', 'athletes.export',
    'parents.view', 'parents.create', 'parents.edit',
    'sports.view', 'age_categories.view', 'venues.view',
    'groups.view', 'groups.manage_members',
    'coaches.view',
    'sessions.view', 'sessions.create', 'sessions.edit',
    'attendance.view', 'attendance.create', 'attendance.edit',
    'evaluations.view',
    'documents.view', 'documents.upload',
    'subscriptions.view', 'subscriptions.create', 'subscriptions.edit',
    'payments.view', 'payments.create', 'payments.reprint_receipt',
    'reports.view', 'reports.export',
    'notifications.view',
  ],
  COACH: [
    'athletes.view', // own — يُقيَّد في الـ Repository
    'parents.view',
    'groups.view',
    'coaches.view',
    'sessions.view', 'sessions.create', 'sessions.edit',
    'attendance.view', 'attendance.create', 'attendance.edit',
    'evaluations.view', 'evaluations.create', 'evaluations.edit',
    'documents.view',
    'reports.view',
    'notifications.view',
  ],
  ACCOUNTANT: [
    'athletes.view', 'parents.view', 'groups.view', 'coaches.view',
    'sessions.view', 'attendance.view',
    'subscriptions.view',
    'payments.view', 'payments.create', 'payments.void', 'payments.reprint_receipt',
    'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.delete', 'expenses.export',
    'cash.view', 'cash.adjust', 'cash.close_day',
    'reports.view', 'reports.view_finance', 'reports.export',
    'notifications.view',
  ],
  VIEWER: [
    'athletes.view', 'parents.view', 'groups.view', 'coaches.view',
    'sessions.view', 'attendance.view', 'subscriptions.view',
    'reports.view', 'notifications.view',
  ],
};

/** هل الدور يملك الصلاحية افتراضيًا (قبل تخصيصات DB). */
export function roleHasPermissionDefault(role: UserRole, code: PermissionCode): boolean {
  const grants = DEFAULT_ROLE_PERMISSIONS[role];
  if (grants === 'ALL') return true;
  return grants.includes(code);
}
