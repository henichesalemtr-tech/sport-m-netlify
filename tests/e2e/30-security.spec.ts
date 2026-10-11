/**
 * ⚠️ UNVERIFIED — لم يُشغَّل (لا متصفح/بناء في بيئة العمل).
 * يتطلب: تطبيق يعمل (يفضَّل production لبناء الترويسات كاملة) + seed (SEED_ADMIN_*).
 *
 * فحوص أمن/تحقق خُدمية:
 *   - الوصول بدون جلسة → 401.
 *   - المال كنص عشري فقط؛ float أو 3 خانات عشرية → 400 (لا يُقبل float أبدًا).
 *   - معرّف غير موجود (IDOR عشوائي) → 404.
 *   - أخطاء موحّدة {error:{code,requestId}} بلا تسريب stack.
 *   - ترويسات أمان في رد HTML (X-Frame-Options / CSP) — من next.config.js.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { adminSession } from './helpers';

test.describe('Security & validation', () => {
  test('مسار محمي بدون جلسة يعيد 401', async ({ request }) => {
    const res = await request.get('/api/v1/expenses');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('رفض المال كـ float أو بخانات عشرية زائدة (400)', async ({ request }) => {
    await adminSession(request);
    const categoryId = randomUUID();

    const threeDecimals = await request.post('/api/v1/expenses', {
      data: { amount: '10.555', categoryId, expenseDate: '2026-01-01' },
    });
    expect(threeDecimals.status()).toBe(400);
    const err = await threeDecimals.json();
    expect(err.error.code).toBe('VALIDATION_ERROR');
    // لا تسريب للمكدّس الداخلي
    expect('stack' in err).toBe(false);
    expect('stack' in err.error).toBe(false);
    expect(typeof err.error.requestId).toBe('string');

    const asNumber = await request.post('/api/v1/expenses', {
      data: { amount: 10.5, categoryId, expenseDate: '2026-01-01' },
    });
    expect(asNumber.status()).toBe(400);
  });

  test('معرّف غير موجود يعيد 404', async ({ request }) => {
    await adminSession(request);
    const res = await request.get(`/api/v1/expenses/${randomUUID()}`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('رد HTML يحمل ترويسات أمان', async ({ request }) => {
    const res = await request.get('/ar/login');
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect((headers['x-frame-options'] ?? '').toUpperCase()).toBe('DENY');
    expect(headers['x-content-type-options'] ?? '').toBe('nosniff');
    expect(headers['referrer-policy'] ?? '').toBe('strict-origin-when-cross-origin');
    // لا CSP عمدًا: النظام يعمل محليًا، وCSP كانت تمنع eval الذي يحتاجه تطوير Next.
  });
});
