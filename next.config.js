/** @type {import('next').NextConfig} */
const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./src/shared/i18n/request.ts');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { allowedOrigins: [] },
    // src/instrumentation.ts: مجدول المهام داخل العملية (تنبيهات قرب انتهاء الاشتراك)
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  // منع تقديم ملفات التخزين الخاصة مباشرة — تُقدَّم عبر مسار موثّق يفحص الصلاحية
  async rewrites() {
    return [];
  },
};

module.exports = withNextIntl(nextConfig);
