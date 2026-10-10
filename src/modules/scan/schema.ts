import { z } from 'zod';
import { uuidSchema } from '@/shared/validation/common';

/** طلب مسح رمز رياضي (QR/باركود). */
export const scanRequestSchema = z.object({
  code: z.string().trim().min(8, 'رمز المسح قصير جدًا').max(256, 'رمز المسح طويل جدًا'),
  /** الحصة المستهدفة — افتراضيًا حصة اليوم الحالية لمجموعة الرياضي. */
  sessionId: uuidSchema.optional(),
  /** وقت المسح الفعلي ISO — افتراضيًا الآن (لحساب التأخر تلقائيًا). */
  at: z.string().datetime('طابع زمني غير صالح — ISO 8601').optional(),
});

export type ScanRequestInput = z.infer<typeof scanRequestSchema>;
