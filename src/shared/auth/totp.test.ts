/**
 * ⚠️ UNVERIFIED — لم يُشغَّل (لا node/بناء في بيئة العمل). يُنفَّذ عبر `npm run test` (Vitest).
 * يثبث أن التحقق الثنائي حقيقي وليس وهميًّا: تشفير/فك + قبول الرمز الصحيح فقط، ورفض الفاسد.
 */
process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.APP_SECRET = 'b'.repeat(64);
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import {
  encryptTotpSecret,
  decryptTotpSecret,
  generateTotpSecret,
  verifyTotpToken,
  verifyTotpSecret,
  buildOtpauthUri,
} from './totp';

describe('TOTP (AES-GCM + otplib)', () => {
  it('encodes/decodes a secret back to the same plaintext', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{16,64}$/i);
    const stored = encryptTotpSecret(secret);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain(secret); // لا يُخزَّن السر خامًا
    expect(decryptTotpSecret(stored)).toBe(secret);
  });

  it('rejects tampered ciphertext (GCM auth tag) without throwing', () => {
    const stored = encryptTotpSecret(generateTotpSecret());
    const tampered = stored.replace(/:([^:]+)$/, ':AAAA');
    expect(decryptTotpSecret(tampered)).toBeNull();
  });

  it('accepts the current code and rejects wrong/absent ones (fail-closed)', () => {
    const secret = generateTotpSecret();
    const stored = encryptTotpSecret(secret);
    const valid = authenticator.generate(secret);
    expect(verifyTotpToken(stored, valid)).toBe(true);
    expect(typeof verifyTotpToken(stored, '000000')).toBe('boolean'); // لا يرمي أبدًا
    expect(verifyTotpToken(null, valid)).toBe(false);
    expect(verifyTotpToken(stored, '12345')).toBe(false); // ليس 6 أرقام
    expect(verifyTotpToken('v1:bad:bad:bad', valid)).toBe(false); // سر لا يُفك
  });

  it('verifies a raw secret only for well-formed base32 (blocks injection)', () => {
    const secret = generateTotpSecret();
    const valid = authenticator.generate(secret);
    expect(verifyTotpSecret(valid, secret)).toBe(true);
    expect(verifyTotpSecret(valid, 'not-base32!!!')).toBe(false);
    expect(verifyTotpSecret(valid, '')).toBe(false);
  });

  it('builds an otpauth URI carrying the secret and standard params', () => {
    const uri = buildOtpauthUri('JBSWY3DPEHPK3PXP', 'coach@example.test', 'SportsApp');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=SportsApp');
    expect(uri).toContain('digits=6');
  });
});
