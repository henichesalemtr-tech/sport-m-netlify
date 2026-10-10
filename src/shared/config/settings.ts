import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { getEnv } from './env';

/**
 * قراءة إعدادات قابلة للتعديل من جدول Setting (لا قيم صلبة في الكود).
 * كل دالة تقبل Transaction اختياريًا لضمان القراءة داخل نفس المعاملة.
 */

export const SETTINGS_KEYS = {
  ATTENDANCE_LATE_THRESHOLD: 'attendance.late_threshold_minutes',
  ATTENDANCE_EDIT_WINDOW: 'attendance.edit_window_minutes',
  ATTENDANCE_ABSENCE_ALERT: 'attendance.consecutive_absence_alert',
  SCAN_EXPIRED_SUBSCRIPTION_POLICY: 'scan.expired_subscription_policy',
  SCAN_RATE_LIMIT_PER_MINUTE: 'scan.rate_limit_per_minute',
  SESSIONS_GENERATE_AHEAD_DAYS: 'sessions.generate_ahead_days',
  AGE_REFERENCE_MODE: 'age.reference_mode',
} as const;

export type ExpiredSubscriptionPolicy = 'block' | 'warn' | 'allow';
export type AgeReferenceMode = 'today' | 'season_start';

type Tx = PrismaTransaction | typeof prisma;

async function readRaw(key: string, tx?: Tx): Promise<string | null> {
  const client = (tx ?? prisma) as typeof prisma;
  const row = await client.setting.findUnique({ where: { key }, select: { value: true } });
  return row?.value ?? null;
}

export async function getSettingString(key: string, fallback: string, tx?: Tx): Promise<string> {
  const v = await readRaw(key, tx);
  return v === null || v.trim() === '' ? fallback : v;
}

export async function getSettingInt(key: string, fallback: number, tx?: Tx): Promise<number> {
  const v = await readRaw(key, tx);
  if (v === null) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function getSettingBool(key: string, fallback: boolean, tx?: Tx): Promise<boolean> {
  const v = await readRaw(key, tx);
  if (v === null) return fallback;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

export interface AttendanceSettings {
  lateThresholdMinutes: number;
  editWindowMinutes: number;
  consecutiveAbsenceAlert: number;
}

export async function getAttendanceSettings(tx?: Tx): Promise<AttendanceSettings> {
  return {
    lateThresholdMinutes: await getSettingInt(SETTINGS_KEYS.ATTENDANCE_LATE_THRESHOLD, 10, tx),
    editWindowMinutes: await getSettingInt(SETTINGS_KEYS.ATTENDANCE_EDIT_WINDOW, 120, tx),
    consecutiveAbsenceAlert: await getSettingInt(SETTINGS_KEYS.ATTENDANCE_ABSENCE_ALERT, 3, tx),
  };
}

export interface ScanSettings {
  expiredSubscriptionPolicy: ExpiredSubscriptionPolicy;
  rateLimitPerMinute: number;
}

export async function getScanSettings(tx?: Tx): Promise<ScanSettings> {
  const raw = await getSettingString(SETTINGS_KEYS.SCAN_EXPIRED_SUBSCRIPTION_POLICY, 'warn', tx);
  const policy: ExpiredSubscriptionPolicy =
    raw === 'block' || raw === 'allow' ? raw : 'warn';
  return {
    expiredSubscriptionPolicy: policy,
    rateLimitPerMinute: await getSettingInt(SETTINGS_KEYS.SCAN_RATE_LIMIT_PER_MINUTE, 30, tx),
  };
}

export async function getAgeReferenceMode(tx?: Tx): Promise<AgeReferenceMode> {
  const raw = await getSettingString(SETTINGS_KEYS.AGE_REFERENCE_MODE, 'season_start', tx);
  return raw === 'today' ? 'today' : 'season_start';
}

export async function getSessionsGenerateAheadDays(tx?: Tx): Promise<number> {
  return getSettingInt(SETTINGS_KEYS.SESSIONS_GENERATE_AHEAD_DAYS, 30, tx);
}

/** منطقة المؤسسة الزمنية (من البيئة). */
export function appTimeZone(): string {
  return getEnv().APP_TIMEZONE;
}
