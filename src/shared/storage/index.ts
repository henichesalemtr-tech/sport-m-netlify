import { randomUUID } from 'node:crypto';
import { getEnv } from '@/shared/config/env';
import { AppError, ErrorCode } from '@/shared/errors';

/**
 * طبقة تخزين مجردة (6.3): قرص محلي افتراضيًا، S3-Compatible اختياريًا.
 * الملفات خارج المجلد العام، أسماء عشوائية، فحص Magic Bytes، حد أقصى للحجم.
 */

export interface StoredFile {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

const MAGIC: Record<string, { bytes: number[]; offset?: number }[]> = {
  'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47] }],
  'image/webp': [{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }], // RIFF....WEBP
  'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
};

const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_DOCS = [...ALLOWED_IMAGES, 'application/pdf'];

/**
 * بناء مسار مطلق آمن لمفتاح تخزين داخل STORAGE_LOCAL_DIR.
 * يُحوَّل الأساس إلى مسار مطلق أولًا: المقارنة بمسار نسبي تفشل دائمًا على Windows
 * وتُرفض الملفات الصالحة. وتُستخدم resolve بدل join ليخرج المفتاح المطلق أو
 * المتضمّن ../ خارج الأساس فيُرفض.
 */
async function resolveStoragePath(storageKey: string): Promise<{ full: string }> {
  const env = getEnv();
  const path = await import('node:path');
  const base = path.resolve(env.STORAGE_LOCAL_DIR);
  const full = path.resolve(base, storageKey);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new AppError(ErrorCode.FORBIDDEN, 'مسار غير صالح');
  }
  return { full };
}

export function detectMimeType(buffer: Buffer, declared?: string): string | null {
  for (const [mime, signatures] of Object.entries(MAGIC)) {
    for (const sig of signatures) {
      const offset = sig.offset ?? 0;
      const ok = sig.bytes.every((b, i) => buffer[offset + i] === b);
      if (ok) {
        if (mime === 'image/webp') {
          // تحقق WEBP عند البايت 8
          if (buffer.slice(8, 12).toString('ascii') !== 'WEBP') continue;
        }
        return mime;
      }
    }
  }
  return declared && ALLOWED_DOCS.includes(declared) ? declared : null;
}

export async function storeFile(
  buffer: Buffer,
  opts: { kind: 'image' | 'document'; declaredMime?: string; subdir?: string },
): Promise<StoredFile> {
  const env = getEnv();
  const allowed = opts.kind === 'image' ? ALLOWED_IMAGES : ALLOWED_DOCS;
  const maxMb = opts.kind === 'image' ? env.STORAGE_MAX_IMAGE_MB : env.STORAGE_MAX_DOCUMENT_MB;

  if (buffer.length > maxMb * 1024 * 1024) {
    throw new AppError(ErrorCode.FILE_TOO_LARGE, `حجم الملف يتجاوز الحد المسموح (${maxMb} ميغابايت)`);
  }

  const mime = detectMimeType(buffer, opts.declaredMime);
  if (!mime || !allowed.includes(mime)) {
    throw new AppError(ErrorCode.UNSUPPORTED_FILE, 'نوع الملف غير مدعوم أو تالف');
  }

  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
  const storageKey = `${opts.subdir ?? opts.kind}s/${randomUUID()}.${ext}`;

  if (env.STORAGE_DRIVER === 'local') {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { full } = await resolveStoragePath(storageKey);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
  } else {
    // S3-Compatible — يُفعَّل بالإعداد (نقطة توسعة موثّقة)
    throw new AppError(ErrorCode.INTERNAL, 'مهيّئ S3 غير مفعّل في هذه النسخة');
  }

  return { storageKey, mimeType: mime, sizeBytes: buffer.length };
}

/**
 * تخزين ملفات الاستيراد (xlsx/csv) — خارج المجلد العام وبأسماء عشوائية.
 * فحص Magic Bytes: xlsx يجب أن يبدأ بتوقيع ZIP (PK\x03\x04)، وcsv نص UTF-8 بلا بايتات ثنائية.
 * لا يمر عبر storeFile لأن أنواعه المسموحة صور/PDF فقط.
 */
export async function storeImportFile(buffer: Buffer, originalName: string): Promise<StoredFile> {
  const env = getEnv();
  if (buffer.length > env.STORAGE_MAX_DOCUMENT_MB * 1024 * 1024) {
    throw new AppError(ErrorCode.FILE_TOO_LARGE, `حجم الملف يتجاوز الحد المسموح (${env.STORAGE_MAX_DOCUMENT_MB} ميغابايت)`);
  }
  const lower = originalName.toLowerCase();
  const isXlsx = lower.endsWith('.xlsx');
  const isCsv = lower.endsWith('.csv');
  if (!isXlsx && !isCsv) {
    throw new AppError(ErrorCode.UNSUPPORTED_FILE, 'يُقبل ملف Excel (xlsx) أو CSV فقط');
  }
  if (isXlsx) {
    const zipMagic = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    if (!zipMagic) {
      throw new AppError(ErrorCode.UNSUPPORTED_FILE, 'ملف Excel تالف أو غير صالح');
    }
  } else if (buffer.includes(0)) {
    throw new AppError(ErrorCode.UNSUPPORTED_FILE, 'ملف CSV يحتوي بايتات ثنائية غير صالحة');
  }

  const mimeType = isXlsx
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv';
  const storageKey = `imports/${randomUUID()}.${isXlsx ? 'xlsx' : 'csv'}`;

  if (env.STORAGE_DRIVER !== 'local') {
    throw new AppError(ErrorCode.INTERNAL, 'مهيّئ S3 غير مفعّل في هذه النسخة');
  }
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { full } = await resolveStoragePath(storageKey);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);

  return { storageKey, mimeType, sizeBytes: buffer.length };
}

/** قراءة ملف للتقديم عبر مسار موثّق يفحص الصلاحية. */
export async function readFile(storageKey: string): Promise<Buffer> {
  const env = getEnv();
  if (env.STORAGE_DRIVER !== 'local') {
    throw new AppError(ErrorCode.INTERNAL, 'مهيّئ S3 غير مفعّل في هذه النسخة');
  }
  const fs = await import('node:fs/promises');
  const { full } = await resolveStoragePath(storageKey);
  return fs.readFile(full);
}
