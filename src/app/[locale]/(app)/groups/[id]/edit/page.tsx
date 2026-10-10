import { GroupForm } from '@/features/groups/group-form';

export const metadata = { title: 'تعديل مجموعة' };

export default function EditGroupPage({ params }: { params: { id: string } }) {
  return <GroupForm groupId={params.id} />;
}
