import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // قاعدة بيانات مُدارة عالية الكمون (Neon) قد تُسقط اتصالها لحظيًّا؛ نسمح بإعادة محاولة
  // واحدة محليًّا لامتصاص هذه السقطات (بقية الخطوات قابلة للتكرار بأمان).
  retries: process.env.CI ? 2 : 1,
  // قاعدة بيانات مُدارة عالية الكمون (Neon) — كل استعلام ~200–300ms ذهابًا وعودة،
  // والاختبارات الدورية (مالية/صلاحيات) تسلسلية عبر نقاط API كثيرة.
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
