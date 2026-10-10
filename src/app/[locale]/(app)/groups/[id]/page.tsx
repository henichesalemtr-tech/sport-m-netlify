import { GroupDetailScreen } from '@/features/groups/group-detail';

export const metadata = { title: 'ملف المجموعة' };

export default function GroupDetailPage({ params }: { params: { id: string } }) {
  return <GroupDetailScreen id={params.id} />;
}
