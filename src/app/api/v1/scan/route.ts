import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { scanService } from '@/modules/scan/service';
import { scanRequestSchema } from '@/modules/scan/schema';

/**
 * POST /api/v1/scan — حل رمز مسح رياضي:
 * بطاقة الرياضي + حالة الاشتراك/الدفع + تسجيل الحضور (مع dedup وتحديد المعدل).
 */
export const POST = apiRoute({
  body: scanRequestSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'attendance.create');
    const result = await scanService.resolve(body, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
