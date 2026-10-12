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
    // الحزم الأصلية (native) يجب أن تبقى خارجية: محرك استعلام Prisma وأرغون2
    // ثنائيات تُحمَّل عند التشغيل؛ ضمّها في حزمة الدالة يُعطّلها على Netlify.
    serverComponentsExternalPackages: ['@prisma/client', 'argon2'],
    // Netlify يبني حزمة كل دالة من تتبّع الملفات (nft)، والمحركات الأصلية تُحمَّل من القرص
    // باسم محسوب وقت التشغيل فلا يلتقطها التتبّع — فتسقط كل مسارات /api في صفحة 500.
    // الإدراج الصريح يضمن العميل المولّد + عميل Prisma + أرغون2 داخل الدوال.
    // ملاحظة إصدار: المفتوح تحت experimental (في Next 15 صار علويًا؛ هنا 14.2 يرفضه علويًا).
    outputFileTracingIncludes: {
      '/api/**': [
        './node_modules/.prisma/client/**',
        './node_modules/@prisma/client/**',
        './node_modules/argon2/**',
      ],
    },
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
