import { PaymentDetailScreen } from '@/features/payments/payment-detail';

export const metadata = { title: 'ملف الدفعة' };

export default function PaymentDetailPage({ params }: { params: { id: string } }) {
  return <PaymentDetailScreen id={params.id} />;
}
