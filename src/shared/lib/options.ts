/**
 * قوائم خيارات ثابتة (قيم Enums من Prisma) — النصوص تُترجم عبر مفاتيح i18n.
 * القيم مطابقة للـ backend (ممنوع نصوص صلبة في المكونات).
 */
import type {
  AthleteStatusName,
  AttendanceStatusName,
  CashTxTypeName,
  DiscountKindName,
  GenderName,
  GroupStatusName,
  NotificationTypeName,
  ReportTypeName,
  SessionStatusName,
  SessionTypeName,
  SubscriptionKindName,
  SubscriptionStatusName,
  TrainingDayName,
  UserRoleName,
  UserStatusName,
  VenueStatusName,
  VenueTypeName,
} from '@/shared/api/types';

export interface Option<T extends string = string> {
  value: T;
  /** مفتاح ترجمة (يُمرر لـ useTranslations مع الnamespace المناسب). */
  labelKey: string;
}

export const ATHLETE_STATUSES: AthleteStatusName[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'WITHDRAWN', 'BLOCKED'];
export const GENDERS: Array<{ value: GenderName; labelKey: string }> = [
  { value: 'MALE', labelKey: 'common:male' },
  { value: 'FEMALE', labelKey: 'common:female' },
];
export const GROUP_STATUSES: GroupStatusName[] = ['ACTIVE', 'INACTIVE'];
export const VENUE_TYPES: VenueTypeName[] = ['HALL', 'FIELD', 'COURT', 'POOL', 'GYM', 'OTHER'];
export const VENUE_STATUSES: VenueStatusName[] = ['AVAILABLE', 'MAINTENANCE', 'CLOSED'];
export const SESSION_TYPES: SessionTypeName[] = ['TRAINING', 'MATCH', 'TOURNAMENT', 'EXAM', 'ACTIVITY', 'MEETING'];
export const SESSION_STATUSES: SessionStatusName[] = ['SCHEDULED', 'CANCELLED', 'COMPLETED'];
export const ATTENDANCE_STATUSES: AttendanceStatusName[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
export const SUBSCRIPTION_STATUSES: SubscriptionStatusName[] = ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'RENEWING', 'CANCELLED'];
export const SUBSCRIPTION_KINDS: SubscriptionKindName[] = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'SESSIONS', 'CUSTOM'];
export const DISCOUNT_KINDS: DiscountKindName[] = ['FIXED', 'PERCENT'];
export const USER_ROLES: UserRoleName[] = ['SUPER_ADMIN', 'ADMIN', 'RECEPTION', 'COACH', 'ACCOUNTANT', 'VIEWER'];
export const USER_STATUSES: UserStatusName[] = ['ACTIVE', 'DISABLED'];
export const CASH_TX_TYPES: CashTxTypeName[] = ['OPENING_BALANCE', 'INCOME', 'EXPENSE', 'ADJUSTMENT', 'REVERSAL'];
export const NOTIFICATION_TYPES: NotificationTypeName[] = [
  'SUBSCRIPTION_EXPIRING',
  'SUBSCRIPTION_EXPIRED',
  'ABSENCE',
  'CONSECUTIVE_ABSENCE',
  'REPEATED_LATE',
  'NEW_PAYMENT',
  'OVERDUE_DEBT',
  'UPCOMING_SESSION',
  'SESSION_RESCHEDULED',
  'SESSION_CANCELLED',
  'DOCUMENT_EXPIRING',
];
export const REPORT_TYPES: ReportTypeName[] = [
  'athletes',
  'subscriptions',
  'payments',
  'debts',
  'attendance',
  'absence',
  'late',
  'coaches',
  'sports',
  'groups',
  'revenues',
  'expenses',
  'cash',
];
export const FINANCE_REPORT_TYPES: ReportTypeName[] = [
  'subscriptions',
  'payments',
  'debts',
  'revenues',
  'expenses',
  'cash',
];
export const TRAINING_DAYS: TrainingDayName[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** مفاتيح ترجمة حالات عامة (status.{VALUE}). */
export function statusLabelKey(value: string): string {
  return `status:${value}`;
}
