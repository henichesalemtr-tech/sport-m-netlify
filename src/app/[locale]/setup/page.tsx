import { SetupScreen } from '@/features/auth/setup-screen';

export const metadata = { title: 'الإعداد الأولي' };
// صفحة ديناميكية: تفحص حالة الإقلاع وقت التشغيل وتقرأ ترويسة الطلب لدمج اللغة.
export const dynamic = 'force-dynamic';

export default function SetupPage() {
  return <SetupScreen />;
}
