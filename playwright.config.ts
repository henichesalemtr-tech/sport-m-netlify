import { defineConfig, devices } from '@playwright/test';
// SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD تُقرأ من .env: Playwright لا يحمّله تلقائيًا.
import './scripts/load-env';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // إعادة محاولة واحدة محليًّا: خادم التطوير يُجمّل دوال المسار عند أول طلب وقد
  // تتصادم جلسات الدخول المتوازية؛ الخطوات الأخرى قابلة للتكرار بأمان.
  retries: process.env.CI ? 2 : 1,
  // مهلة واسعة: compilation لخادم التطوير + أجهزة أبطأ (قاعدة MySQL محلية سريعة).
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'ar',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    // أحجام الهاتف المطلوبة في الجزء 9.4
    { name: 'mobile-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 } } },
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-430', use: { ...devices['Desktop Chrome'], viewport: { width: 430, height: 932 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
