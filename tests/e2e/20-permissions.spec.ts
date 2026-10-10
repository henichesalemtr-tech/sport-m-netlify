/**
 * ⚠️ UNVERIFIED — لم يُشغَّل (لا متصفح/بناء في بيئة العمل).
 * يتطلب: تطبيق يعمل + seed (SEED_ADMIN_*).
 *
 * يثبت أن التفويض يُفرض خُدميًّا (UI إخفاء ≠ أمان):
 *   دور VIEWER (لا يملك users.manage ولا expenses.create) → 403 INSUFFICIENT_PERMISSION.
 *   المدير SUPER_ADMIN → 200.
 * المسار المُنشئ للـ VIEWER يُسجَّل دخوله في سياق مستقل (Cookie منفصل).
 */
import { test, expect, type Browser } from '@playwright/test';
import { adminSession, unique } from './helpers';

const VIEWER_PASSWORD = 'E2eViewer#12345';

/** إنشاء مستخدم (بصلاحية المدير على `request`) ثم تسجيل دخوله في سياق جديد وإرجاع طلباته. */
async function viewerRequest(browser: Browser, request: Parameters<typeof adminSession>[0]) {
  const email = `e2e.viewer.${unique()}@example.test`;
  const created = await request.post('/api/v1/users', {
    data: { email, fullName: 'E2E Viewer', password: VIEWER_PASSWORD, role: 'VIEWER' },
  });
  expect(created.ok()).toBeTruthy();

  const ctx = await browser.newContext();
  const login = await ctx.request.post('/api/v1/auth/login', {
    data: { email, password: VIEWER_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  return ctx;
}

test.describe('Server-side permissions', () => {
  test('VIEWER ممنوع خُدميًّا من إدارة المستخدمين وإنشاء المصروفات', async ({ browser, request }) => {
    await adminSession(request);
    const viewerCtx = await viewerRequest(browser, request);
    try {
      const listUsers = await viewerCtx.request.get('/api/v1/users');
      expect(listUsers.status()).toBe(403);
      const err = (await listUsers.json()).error;
      expect(err.code).toBe('INSUFFICIENT_PERMISSION');

      const createExpense = await viewerCtx.request.post('/api/v1/expenses', {
        data: { amount: '10.00', categoryId: '00000000-0000-4000-8000-000000000000', expenseDate: '2026-01-01' },
      });
      expect(createExpense.status()).toBe(403);
    } finally {
      await viewerCtx.close();
    }
  });

  test('المدير يقرأ قائمة المستخدمين (200) لنفس النقطة التي رُفض عندها الـ VIEWER', async ({ request }) => {
    await adminSession(request);
    const res = await request.get('/api/v1/users', { params: { pageSize: '10' } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.meta).toBeTruthy();
  });
});
