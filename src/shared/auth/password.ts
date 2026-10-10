import argon2 from 'argon2';
import crypto from 'node:crypto';

/** تجزئة كلمة المرور بـ Argon2id (6.1). */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** سياسة كلمة مرور معقولة (6.1). */
export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  if (!/[A-Za-z]/.test(pw)) issues.push('يجب أن تحتوي على حرف واحد على الأقل');
  if (!/[0-9]/.test(pw)) issues.push('يجب أن تحتوي على رقم واحد على الأقل');
  return issues;
}

/** توليد رمز عشوائي آمن (≥128بت) لرموز المسح ورموز الاستعادة. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** تجزئة SHA-256 للتخزين (رموز الجلسة/المسح/الاستعادة لا تُخزَّن نصية). */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** توقيع HMAC لرموز المسح (7.9) — بديل آمن عن التخزين العشوائي عند الحاجة. */
export function hmacSign(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
