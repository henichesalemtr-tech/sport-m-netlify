import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/shared/auth/session';
import { resolvePermissions } from '@/shared/permissions/guard';
import { getSettings } from '@/modules/settings/service';
import { SessionProvider } from '@/shared/components/session-context';
import { AppShell } from '@/shared/components/app-shell';
import type { SessionPayload } from '@/shared/api/types';

export const dynamic = 'force-dynamic';

/**
 * تخطيط هيكل التطبيق: يتحقق من الجلسة في الخادم (الحقيقة الوحيدة)،
 * ويحل الصلاحيات والإعدادات ثم يضخها لـ SessionProvider + AppShell.
 */
export default async function AppLayout({
  children,
  params: { locale },
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const session = await getSession();
  if (!session) {
    const prefix = locale === 'ar' ? '' : `/${locale}`;
    redirect(`${prefix}/login`);
  }

  const [permissions, settings] = await Promise.all([
    resolvePermissions(session.role),
    getSettings(),
  ]);

  const payload: SessionPayload = {
    user: {
      userId: session.userId,
      email: session.email,
      fullName: session.fullName,
      role: session.role,
      linkedCoachId: session.linkedCoachId,
    },
    permissions: Array.from(permissions),
    settings,
  };

  return (
    <SessionProvider payload={payload}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
