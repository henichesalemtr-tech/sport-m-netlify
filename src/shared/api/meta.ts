import type { AuthContext } from '@/shared/permissions/guard';

/** سياق الطلب الموحّد الممرَّر لكل عمليات الـ Service (Audit/RequestId). */
export interface Meta {
  user: AuthContext;
  requestId: string;
  ip?: string;
  userAgent?: string;
}
