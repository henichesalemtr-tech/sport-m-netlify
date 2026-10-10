'use client';

import { ToastProvider } from '@/shared/ui-kit/toast';
import type { ReactNode } from 'react';

/** مزودات عامة على مستوى العميل (تنبيهات + سياق الجلسة يُحقن من الخادم). */
export function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
