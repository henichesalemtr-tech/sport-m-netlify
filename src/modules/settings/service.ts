import { prisma } from '@/shared/db/client';
import { getEnv } from '@/shared/config/env';
import { writeAudit } from '@/shared/audit';
import { notFound, validationError } from '@/shared/errors';
import type { AuthContext } from '@/shared/permissions/guard';
import { settingsRepository } from './repository';
import type { SettingValueType, SettingsGroupQuery, UpdateSettingInput } from './schema';

export interface Meta {
  user: AuthContext | null;
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export type SettingValue = string | number | boolean | Record<string, unknown> | unknown[];

export interface SettingDto {
  key: string;
  value: SettingValue;
  rawValue: string;
  valueType: SettingValueType;
  group: string;
  description: string | null;
  updatedAt: Date | null;
}

export interface AppSettings {
  orgName: string;
  currencyCode: string;
  currencyDecimals: number;
  timezone: string;
  fiscalStartMonth: number;
  numberSystem: string;
  attendanceLateMinutes: number;
  consecutiveAbsenceAlert: number;
  subscriptionExpiringDays: number;
  allowOverpay: boolean;
  receiptTemplate: string;
  scanDedupSeconds: number;
  athletesRegistrationFormat: string;
  totpEnabled: boolean;
}

interface SettingDefinition {
  key: string;
  group: string;
  valueType: SettingValueType;
  defaultValue: SettingValue | (() => SettingValue);
  description?: string;
}

/** المفاتيح الشائعة مع قيمها الافتراضية — لا قيم صلبة مبعثرة في الكود (Settings-driven). */
const COMMON_SETTINGS: readonly SettingDefinition[] = [
  { key: 'org.name', group: 'org', valueType: 'string', defaultValue: '', description: 'اسم المنظمة' },
  { key: 'currency.code', group: 'currency', valueType: 'string', defaultValue: 'DZD', description: 'رمز العملة' },
  { key: 'currency.decimals', group: 'currency', valueType: 'number', defaultValue: 2, description: 'عدد الخانات العشرية' },
  { key: 'timezone', group: 'general', valueType: 'string', defaultValue: 'Africa/Algiers', description: 'المنطقة الزمنية للمؤسسة' },
  { key: 'fiscal.startMonth', group: 'fiscal', valueType: 'number', defaultValue: 9, description: 'شهر بداية السنة المالية' },
  { key: 'number.system', group: 'general', valueType: 'string', defaultValue: 'arab', description: 'نظام الأرقام (arab|latn)' },
  { key: 'attendance.lateMinutes', group: 'attendance', valueType: 'number', defaultValue: 10, description: 'حد التأخر بالدقائق' },
  { key: 'attendance.consecutiveAbsenceAlert', group: 'attendance', valueType: 'number', defaultValue: 3, description: 'عدد الغيابات المتتالية للتنبيه' },
  { key: 'subscription.expiringDays', group: 'subscription', valueType: 'number', defaultValue: 7, description: 'أيام التنبيه قبل انتهاء الاشتراك' },
  { key: 'payment.allowOverpay', group: 'payment', valueType: 'boolean', defaultValue: false, description: 'السماح بالدفع الزائد' },
  { key: 'receipt.template', group: 'receipt', valueType: 'string', defaultValue: 'A4', description: 'قالب الوصل (A4|80mm)' },
  { key: 'scan.dedupSeconds', group: 'scan', valueType: 'number', defaultValue: () => getEnv().SCAN_DEDUP_SECONDS, description: 'ثواني منع تكرار المسح' },
  { key: 'athletes.registrationFormat', group: 'athletes', valueType: 'string', defaultValue: 'ATH-{YYYY}-{SEQ:5}', description: 'صيغة رقم التسجيل' },
  { key: 'auth.totpEnabled', group: 'auth', valueType: 'boolean', defaultValue: () => getEnv().TOTP_ENABLED, description: 'تفعيل التحقق الثنائي TOTP' },
];

/** خريطة أسماء الحقول في AppSettings لكل مفتاح. */
const SETTING_KEY_MAP = {
  'org.name': 'orgName',
  'currency.code': 'currencyCode',
  'currency.decimals': 'currencyDecimals',
  timezone: 'timezone',
  'fiscal.startMonth': 'fiscalStartMonth',
  'number.system': 'numberSystem',
  'attendance.lateMinutes': 'attendanceLateMinutes',
  'attendance.consecutiveAbsenceAlert': 'consecutiveAbsenceAlert',
  'subscription.expiringDays': 'subscriptionExpiringDays',
  'payment.allowOverpay': 'allowOverpay',
  'receipt.template': 'receiptTemplate',
  'scan.dedupSeconds': 'scanDedupSeconds',
  'athletes.registrationFormat': 'athletesRegistrationFormat',
  'auth.totpEnabled': 'totpEnabled',
} as const satisfies Record<string, keyof AppSettings>;

function resolveDefault(def: SettingDefinition): SettingValue {
  return typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue;
}

function isValueType(v: SettingValueType): v is SettingValueType {
  return v === 'string' || v === 'number' || v === 'boolean' || v === 'json';
}

/** تحويل القيمة المخزنة (نص) إلى قيمة مكتوبة حسب النوع. دالة نقية. */
export function parseSettingValue(raw: string, valueType: string): SettingValue {
  if (!isValueType(valueType)) return raw;
  switch (valueType) {
    case 'string':
      return raw;
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw validationError({ value: [`القيمة "${raw}" ليست رقمًا صالحًا`] });
      return n;
    }
    case 'boolean':
      return raw === 'true';
    case 'json': {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') {
          throw validationError({ value: ['قيمة json يجب أن تكون كائنًا أو مصفوفة'] });
        }
        return parsed as Record<string, unknown> | unknown[];
      } catch (e) {
        if (e instanceof SyntaxError) throw validationError({ value: ['قيمة json غير صالحة'] });
        throw e;
      }
    }
  }
}

/** التحقق من القيمة الواردة وتسلسلها للتخزين كنص. دالة نقية. */
export function serializeSettingValue(value: unknown, valueType: SettingValueType): string {
  switch (valueType) {
    case 'string':
      if (typeof value !== 'string') throw validationError({ value: ['القيمة يجب أن تكون نصًا'] });
      if (value.length > 10_000) throw validationError({ value: ['القيمة طويلة جدًا'] });
      return value;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw validationError({ value: ['القيمة يجب أن تكون رقمًا'] });
      }
      return String(value);
    case 'boolean':
      if (typeof value !== 'boolean') throw validationError({ value: ['القيمة يجب أن تكون منطقية'] });
      return value ? 'true' : 'false';
    case 'json': {
      if (value === null || typeof value !== 'object') {
        throw validationError({ value: ['قيمة json يجب أن تكون كائنًا أو مصفوفة'] });
      }
      try {
        return JSON.stringify(value);
      } catch {
        throw validationError({ value: ['تعذّر تسلسل قيمة json'] });
      }
    }
  }
}

export function inferValueType(value: unknown): SettingValueType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  return 'json';
}

function toDto(
  key: string,
  rawValue: string,
  valueType: SettingValueType,
  group: string,
  description: string | null,
  updatedAt: Date | null,
): SettingDto {
  let value: SettingValue;
  try {
    value = parseSettingValue(rawValue, valueType);
  } catch {
    // قيمة تالفة مخزنة — تُعرض كنص خام بدل الانهيار
    value = rawValue;
  }
  return { key, value, rawValue, valueType, group, description, updatedAt };
}

export const settingsService = {
  /** قراءة كل الإعدادات (أو مجموعة) مع القيم المكتوبة. */
  async list(query: SettingsGroupQuery): Promise<SettingDto[]> {
    const rows = query.group
      ? await settingsRepository.findByGroup(query.group)
      : await settingsRepository.findAll();
    return rows.map((r) =>
      toDto(
        r.key,
        r.value,
        isValueType(r.valueType) ? r.valueType : 'string',
        r.group,
        r.description,
        r.updatedAt,
      ),
    );
  },

  async get(key: string): Promise<SettingDto> {
    const row = await settingsRepository.findByKey(key);
    if (row) {
      return toDto(
        row.key,
        row.value,
        isValueType(row.valueType) ? row.valueType : 'string',
        row.group,
        row.description,
        row.updatedAt,
      );
    }
    const def = COMMON_SETTINGS.find((d) => d.key === key);
    if (!def) throw notFound('الإعداد');
    const fallback = resolveDefault(def);
    return toDto(def.key, serializeSettingValue(fallback, def.valueType), def.valueType, def.group, def.description ?? null, null);
  },

  /** ضبط قيمة إعداد (إنشاء أو تحديث) مع Audit في نفس المعاملة. */
  async set(key: string, input: UpdateSettingInput, meta: Meta): Promise<SettingDto> {
    const existing = await settingsRepository.findByKey(key);
    const def = COMMON_SETTINGS.find((d) => d.key === key);
    const valueType: SettingValueType = input.valueType ??
      (existing && isValueType(existing.valueType) ? existing.valueType : undefined) ??
      def?.valueType ??
      inferValueType(input.value);
    const serialized = serializeSettingValue(input.value, valueType);
    const group = input.group ?? existing?.group ?? def?.group ?? 'general';
    const description = input.description ?? existing?.description ?? def?.description ?? null;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await settingsRepository.upsert(
        key,
        { value: serialized, valueType, group, description, updatedBy: meta.user?.userId ?? null },
        tx,
      );
      await writeAudit(
        {
          userId: meta.user?.userId ?? null,
          action: 'SETTINGS_CHANGE',
          entityType: 'Setting',
          entityId: row.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: existing ? { value: existing.value, valueType: existing.valueType, group: existing.group } : null,
          after: { value: serialized, valueType, group },
          metadata: { key },
        },
        tx,
      );
      return row;
    });

    return toDto(updated.key, updated.value, valueType, updated.group, updated.description, updated.updatedAt);
  },

  /**
 * قراءة الإعدادات الشائعة ككائن مكتوب مع القيم الافتراضية عند الغياب.
 * تُستخدم داخليًا من بقية الوحدات (currency, timezone, fiscal...).
 */
  async getSettings(): Promise<AppSettings> {
    const rows = await settingsRepository.findByKeys(COMMON_SETTINGS.map((d) => String(d.key)));
    const byKey = new Map(rows.map((r) => [r.key, r] as const));

    const settings = {} as AppSettings;
    for (const def of COMMON_SETTINGS) {
      const key = def.key as keyof typeof SETTING_KEY_MAP;
      const field = SETTING_KEY_MAP[key];
      if (!field) continue;
      const row = byKey.get(key);
      let value: SettingValue = resolveDefault(def);
      if (row) {
        try {
          value = parseSettingValue(row.value, def.valueType);
        } catch {
          value = resolveDefault(def); // قيمة تالفة — نعود للافتراضي
        }
      }
      // إسناد آمن حسب نوع الحقل في AppSettings
      const target = settings as unknown as Record<string, SettingValue>;
      target[field] = value;
    }
    return settings;
  },
};

/** اختصار مشترك لقراءة الإعدادات الشائعة. */
export function getSettings(): Promise<AppSettings> {
  return settingsService.getSettings();
}
