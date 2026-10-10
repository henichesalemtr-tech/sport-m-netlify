import { Suspense } from 'react';
import { LoginScreen } from '@/features/auth/login-screen';

export const metadata = { title: 'تسجيل الدخول' };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; expired?: string };
}) {
  const nextPath =
    searchParams.next && searchParams.next.startsWith('/') ? searchParams.next : null;
  return (
    <Suspense fallback={null}>
      <LoginScreen nextPath={nextPath} expired={searchParams.expired === '1'} />
    </Suspense>
  );
}
