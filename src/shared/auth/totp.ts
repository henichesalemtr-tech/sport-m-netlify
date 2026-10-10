/**
 * التحقق الثنائي (TOTP) — تشفير/فك تشفير السر بـ AES-256-GCM (المفتاح مشتق من SESSION_SECRET)،
 * وتوليد السر/الرابط والتحقق عبر otplib. السر يُخزَّن مشفّرًا في العمود totp_secret.
 *
 * ملاحظة تحقق: منطق التشفير/التحقق مُغطّى باختبار وحدة (src/shared/auth/totp.test.ts).
 * يتطلب عمود `totp_secret` (انظر prisma/schema.prisma) ومتغير SESSION_SECRET صالح.
 */
import crypto from 'node:crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { getEnv } from '@/shared/config/env';

/** نافذة السماح (عدد الفترات ±) لاستيعاب انحراف الساعة البسيط. */
const TOTP_WINDOW = 1;
// otplib يقرأ النافذة من options (check لا يستقبلها كمعامل ثالث).
authenticator.options = { ...authenticator.options, window: TOTP_WINDOW };

/** مفتاح تشفير 32 بايت مشتق بشكل حتمي من SESSION_SECRET. */
function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(getEnv().SESSION_SECRET, 'utf8').digest();
}

/** تشفير السر (base32) لقيمة قابلة للتخزين: v1:iv:tag:data (كلها base64url). */
export function encryptTotpSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join(':');
}

/** فك التشفير — يرمي إذا كانت البيانات تالفة (GCM tag لا يطابق). */
export function decryptTotpSecret(stored: string): string | null {
  try {
    const parts = stored.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    const iv = Buffer.from(parts[1] as string, 'base64url');
    const tag = Buffer.from(parts[2] as string, 'base64url');
    const data = Buffer.from(parts[3] as string, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

/** توليد سر TOTP جديد (base32). */
export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

/** رابط otpauth القياسي لتطبيقات المصادقة. */
export function buildOtpauthUri(secret: string, accountName: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const q = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${q.toString()}`;
}

/** رمز QR كـ data-url لعرضه في الشاشة (للمسح بالكاميرا). */
export async function totpQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, { margin: 1, errorCorrectionLevel: 'M' });
}

/**
 * التحقق من رمز مقابل السر المشفّر المخزّن — تفشل بأمان (false) عند غياب السر
 * أو فكّ تشفيره أو عدم تطابق الرمز ضمن النافذة. لا تقبل أي رمز.
 */
export function verifyTotpToken(storedEncrypted: string | null, code: string): boolean {
  if (!storedEncrypted || !/^\d{6}$/.test(code)) return false;
  const secret = decryptTotpSecret(storedEncrypted);
  if (!secret) return false;
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}

/**
 * التحقق من رمز مقابل سر خام (base32) — يُستخدم في تدفق التفعيل قبل التخزين.
 * يرفض السر الطويل/الفارغ لتفادي الحقن في otpauth.
 */
export function verifyTotpSecret(code: string, secret: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  if (!/^[A-Z2-7]{16,64}$/i.test(secret)) return false;
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}
