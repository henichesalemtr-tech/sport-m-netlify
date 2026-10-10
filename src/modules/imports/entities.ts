/**
 * تعريفات الكيانات القابلة للاستيراد — التحقق من الصفوف دوال نقية.
 * حاليًا: الرياضيون (athletes.import). نقطة توسعة: أضف كيانًا جديدًا للسجل.
 */
import { z } from 'zod';

export interface ImportFieldDef {
  name: string;
  label: string;
  required: boolean;
  aliases?: string[];
}

export interface RowValidationOk<T> {
  ok: true;
  value: T;
}
export interface RowValidationFail {
  ok: false;
  errors: Array<{ field: string; message: string }>;
}
export type RowValidation<T> = RowValidationOk<T> | RowValidationFail;

export interface ImportEntityDef<T> {
  entityType: string;
  entityTypeLabel: string;
  /** رمز الصلاحية المطلوبة للاستيراد. */
  permission: string;
  fields: ImportFieldDef[];
  /** رأس CSV للقالب التنزيل. */
  templateHeaders: string[];
  templateExample: string[];
  validateRow(raw: Record<string, string>): RowValidation<T>;
  /** مفاتيح كشف التكرار من الصف الصالح. */
  duplicateKeys(value: T): { phone: string | null; email: string | null; identity: string };
}

const athleteGenderSchema = z.enum(['MALE', 'FEMALE']);

const athleteDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'تاريخ غير صالح');

const athletePhoneSchema = z
  .string()
  .regex(/^[0-9+\s()-]{6,20}$/, 'رقم الهاتف غير صالح')
  .optional()
  .or(z.literal('').transform(() => undefined));

const athleteEmailSchema = z
  .string()
  .trim()
  .email('بريد إلكتروني غير صالح')
  .optional()
  .or(z.literal('').transform(() => undefined));

export interface AthleteImportRow {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: 'MALE' | 'FEMALE';
  phone?: string;
  email?: string;
  address?: string;
  registrationNo?: string;
  notes?: string;
}

const athleteRowSchema = z.object({
  firstName: z.string().trim().min(2, 'الاسم قصير جدًا').max(60),
  lastName: z.string().trim().min(2, 'اسم العائلة قصير جدًا').max(60),
  birthDate: athleteDateSchema,
  gender: athleteGenderSchema.default('MALE'),
  phone: athletePhoneSchema,
  email: athleteEmailSchema,
  address: z.string().trim().max(500).optional().or(z.literal('').transform(() => undefined)),
  registrationNo: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  notes: z.string().trim().max(2000).optional().or(z.literal('').transform(() => undefined)),
});

/** تطبيع قيم الجنس المقبولة (ذكر/أنثى/M/F...). دالة نقية. */
export function normalizeGender(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (['m', 'male', 'ذكر', 'mâle'].includes(v)) return 'MALE';
  if (['f', 'female', 'أنثى', 'انثى', 'femme'].includes(v)) return 'FEMALE';
  return raw.trim().toUpperCase();
}

export function validateAthleteRow(raw: Record<string, string>): RowValidation<AthleteImportRow> {
  const candidate = {
    ...raw,
    gender: raw.gender ? normalizeGender(raw.gender) : '',
  };
  if (candidate.gender === '') delete candidate.gender;
  const result = athleteRowSchema.safeParse(candidate);
  if (result.success) {
    return { ok: true, value: result.data as AthleteImportRow };
  }
  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || '_',
    message: issue.message,
  }));
  return { ok: false, errors };
}

/** هوية صف لكشف التكرار داخل الملف (الاسم الكامل + تاريخ الميلاد). */
export function athleteIdentity(v: AthleteImportRow): string {
  return `${v.firstName.trim().toLowerCase()}|${v.lastName.trim().toLowerCase()}|${v.birthDate}`;
}

export const ATHLETE_ENTITY: ImportEntityDef<AthleteImportRow> = {
  entityType: 'athlete',
  entityTypeLabel: 'الرياضيون',
  permission: 'athletes.import',
  fields: [
    { name: 'firstName', label: 'الاسم', required: true, aliases: ['first_name', 'الاسم الشخصي'] },
    { name: 'lastName', label: 'اللقب', required: true, aliases: ['last_name', 'اسم العائلة'] },
    { name: 'birthDate', label: 'تاريخ الميلاد', required: true, aliases: ['birth_date', 'تاريخ الازدياد'] },
    { name: 'gender', label: 'الجنس', required: false, aliases: ['ذكر/أنثى'] },
    { name: 'phone', label: 'الهاتف', required: false, aliases: ['phone_number'] },
    { name: 'email', label: 'البريد الإلكتروني', required: false },
    { name: 'address', label: 'العنوان', required: false },
    { name: 'registrationNo', label: 'رقم التسجيل', required: false, aliases: ['registration_no'] },
    { name: 'notes', label: 'ملاحظات', required: false },
  ],
  templateHeaders: ['الاسم', 'اللقب', 'تاريخ الميلاد', 'الجنس', 'الهاتف', 'البريد الإلكتروني', 'العنوان', 'رقم التسجيل', 'ملاحظات'],
  templateExample: ['محمد', 'بن علي', '2010-05-14', 'ذكر', '0555123456', '', '', '', ''],
  validateRow: validateAthleteRow,
  duplicateKeys: (v) => ({
    phone: v.phone?.replace(/\s+/g, '') ?? null,
    email: v.email?.toLowerCase() ?? null,
    identity: athleteIdentity(v),
  }),
};

/** سجل الكيانات القابلة للاستيراد. */
export const IMPORT_ENTITIES: Record<string, ImportEntityDef<AthleteImportRow>> = {
  athlete: ATHLETE_ENTITY,
};

export function getEntityDef(entityType: string): ImportEntityDef<AthleteImportRow> | undefined {
  return IMPORT_ENTITIES[entityType];
}
