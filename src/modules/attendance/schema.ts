import { z } from 'zod';
import { listQuerySchema } from '@/shared/api/query';
import { dateOnlySchema, uuidSchema } from '@/shared/validation/common';

export const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
export const attendanceMethodSchema = z.enum(['MANUAL', 'BULK', 'QR', 'BARCODE', 'EXTERNAL']);
export const recordedAtSchema = z.string().datetime('طابع زمني غير صالح — ISO 8601');

/** تسجيل حضور لرياضي في حصة (فردى). */
export const recordAttendanceSchema = z.object({
  sessionId: uuidSchema,
  athleteId: uuidSchema,
  status: attendanceStatusSchema.optional(), // افتراضيًا PRESENT/LATE تلقائيًا حسب دقائق التأخر
  method: attendanceMethodSchema.default('MANUAL'),
  recordedAt: recordedAtSchema.optional(), // وقت الحضور الفعلي (لحساب التأخر) — افتراضيًا الآن
  minutesLate: z.number().int().min(0).max(600).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

/** تسجيل جماعي: تحديد الكل حاضرًا ثم تعديل حالات فردية. */
export const bulkAttendanceEntrySchema = z.object({
  athleteId: uuidSchema,
  status: attendanceStatusSchema.optional(),
  minutesLate: z.number().int().min(0).max(600).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const bulkAttendanceSchema = z.object({
  sessionId: uuidSchema,
  markAllPresent: z.boolean().default(false),
  entries: z.array(bulkAttendanceEntrySchema).max(500).default([]),
  method: attendanceMethodSchema.default('BULK'),
  recordedAt: recordedAtSchema.optional(),
});

/** تعديل سجل حضور — خارج النافذة يتطلب صلاحية attendance.edit_past. */
export const updateAttendanceSchema = z.object({
  id: uuidSchema,
  status: attendanceStatusSchema.optional(),
  minutesLate: z.number().int().min(0).max(600).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const attendanceParamsSchema = z.object({ id: uuidSchema });

/** ورقة الحضور: لحصة محددة أو لمجموعة ضمن فترة. */
export const attendanceListQuerySchema = listQuerySchema.extend({
  sessionId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  athleteId: uuidSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;
export type BulkAttendanceInput = z.infer<typeof bulkAttendanceSchema>;
export type BulkAttendanceEntry = z.infer<typeof bulkAttendanceEntrySchema>;
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;
