import { AthleteProfileScreen } from '@/features/athletes/athlete-profile';

export const metadata = { title: 'ملف الرياضي' };

export default function AthleteProfilePage({ params }: { params: { id: string } }) {
  return <AthleteProfileScreen id={params.id} />;
}
