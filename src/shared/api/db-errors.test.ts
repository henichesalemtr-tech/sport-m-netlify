import { describe, expect, it } from 'vitest';
import { transientDbRetryAfterSeconds } from './db-errors';

class PrismaClientInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrismaClientInitializationError';
  }
}

function knownError(code: string): Error {
  const e = new Error(`Prisma error ${code}`);
  e.name = 'PrismaClientKnownRequestError';
  Object.assign(e, { code });
  return e;
}

describe('transientDbRetryAfterSeconds', () => {
  it('يعتبر تعذّر الاتصال عابرًا', () => {
    expect(
      transientDbRetryAfterSeconds(
        new PrismaClientInitializationError(
          "Can't reach database server at `ep-x.neon.tech:5432`",
        ),
      ),
    ).toBe(2);
  });

  it('يعتبر مهلة انتظار المجموعة أو انقطاع الخادم عابرًا', () => {
    expect(transientDbRetryAfterSeconds(knownError('P1001'))).toBe(2);
    expect(transientDbRetryAfterSeconds(knownError('P2024'))).toBe(2);
  });

  it('لا يعتبر أخطاء البيانات или الصراعات عابرة', () => {
    expect(transientDbRetryAfterSeconds(knownError('P2002'))).toBeNull();
    expect(transientDbRetryAfterSeconds(knownError('P2025'))).toBeNull();
    expect(transientDbRetryAfterSeconds(knownError('P2028'))).toBeNull();
    expect(transientDbRetryAfterSeconds(new Error('boom'))).toBeNull();
    expect(transientDbRetryAfterSeconds(null)).toBeNull();
    expect(transientDbRetryAfterSeconds('P1001')).toBeNull();
  });
});
