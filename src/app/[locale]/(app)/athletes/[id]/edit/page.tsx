import { AthleteForm } from '@/features/athletes/athlete-form';

export const metadata = { title: 'تعديل رياضي' };

export default function EditAthletePage({ params }: { params: { id: string } }) {
  return <AthleteForm athleteId={params.id} />;
}
