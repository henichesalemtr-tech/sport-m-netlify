/**
 * اختبار دخان للواجهة: إعادة التوجيه للّوجن + حقول الدخول + بيانات خاطئة لا تُنشئ جلسة.
 */
import { test, expect } from '@playwright/test';
import { postLogin } from './helpers';

test.describe('Auth UI', () => {
  test('زيارة مسار محمي بدون جلسة تعيد التوجيه إلى صفحة الدخول', async ({ page }) => {
    await page.goto('/ar/athletes');
    await expect(page).toHaveURL(/\/login/);
  });

  test('صفحة الدخول تعرض حقلي البريد وكلمة المرور', async ({ page }) => {
    await page.goto('/ar/login');
    await expect(page.getByLabel(/البريد|email/i).first()).toBeVisible();
    await expect(page.getByLabel(/كلمة المرور|password/i).first()).toBeVisible();
  });

  test('محاولة دخول ببيانات خاطئة لا تنشئ جلسة', async ({ page, request }) => {
    await page.goto('/ar/login');
    const res = await postLogin(request, 'nope@example.test', 'wrong-password-123');
    expect(res.status()).toBe(401);
  });
});
