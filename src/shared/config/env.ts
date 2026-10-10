import { z } from 'zod';

const hex64 = z.string().regex(/^[a-f0-9]{64}$/i, 'APP_SECRET must be 64 hex chars');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  APP_SECRET: hex64,
  SESSION_SECRET: hex64,
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(60),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(24),
  APP_TIMEZONE: z.string().default('Africa/Algiers'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage/private'),
  STORAGE_MAX_IMAGE_MB: z.coerce.number().positive().default(5),
  STORAGE_MAX_DOCUMENT_MB: z.coerce.number().positive().default(10),
  SMTP_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TOTP_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  SCAN_DEDUP_SECONDS: z.coerce.number().int().positive().default(10),
  BACKUP_DIR: z.string().default('./storage/backups'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  /**
   * تشغيل مهام الإشعارات داخل عملية الخادم (بدون عامل منفصل).
   * آمنة للتكرار: كل مهمة مقفلة بـ JobRun.lockKey والإشعارات Idempotent بـ dedupeKey.
   */
  JOBS_IN_PROCESS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  JOBS_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * يتحقق من متغيرات البيئة عند الإقلاع ويفشل برسالة واضحة عند النقص (10.4).
 */
export function getEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `إعداد البيئة غير صالح — تعذّر بدء التشغيل.\n${issues}\n` +
        'انسخ .env.example إلى .env واملأ القيم.',
    );
  }
  cached = result.data;
  return cached;
}
