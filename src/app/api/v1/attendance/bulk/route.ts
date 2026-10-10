import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { attendanceService } from '@/modules/attendance/service';
import { bulkAttendanceSchema } from '@/modules/attendance/schema';

/**
 * POST /api/v1/attendance/bulk — تسجيل جماعي:
 * markAllPresent ثم تعديل حالات فردية عبر entries (المكرر يُتخطى).
 */
export const POST = apiRoute({
  body: bulkAttendanceSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'attendance.create');
    const result = await attendanceService.bulk(body, { user, requestId, ip, userAgent });
    return { data: result };
  },
});
