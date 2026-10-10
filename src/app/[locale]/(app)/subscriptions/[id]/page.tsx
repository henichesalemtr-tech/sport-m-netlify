import { SubscriptionDetailScreen } from '@/features/subscriptions/subscription-detail';

export const metadata = { title: 'ملف الاشتراك' };

export default function SubscriptionDetailPage({ params }: { params: { id: string } }) {
  return <SubscriptionDetailScreen id={params.id} />;
}
