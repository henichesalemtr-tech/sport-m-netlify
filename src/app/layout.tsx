import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { cairo } from './fonts';

export const metadata: Metadata = {
  title: {
    default: 'نظام إدارة رياضية',
    template: '%s | نظام إدارة رياضية',
  },
  description: 'نظام إدارة رياضية احترافي للنوادي والأكاديميات والجمعيات الرياضية',
  manifest: '/manifest.webmanifest',
  applicationName: 'نظام إدارة رياضية',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon.svg' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7faf8' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1a16' },
  ],
};

/**
 * التخطيط الجذري: `dir="rtl"` و `lang="ar"` افتراضيًا (اللغة الأساسية).
 * لتوجيه اللغات (fr/en) يضبط LocaleAwareAttributes في [locale]/layout.tsx
 * خصائص <html> حسب اللغة الحالية في العميل.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.className} suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
