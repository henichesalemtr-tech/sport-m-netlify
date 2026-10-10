import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { attendanceService } from '@/modules/attendance/service';
import {
  attendanceListQuerySchema,
  recordAttendanceSchema,
  updateAttendanceSchema,
} from '@/modules/attendance/schema';

/** GET — ورقة الحضور (سجلات) لمجموعة/فترة/حصة، مع نطاق المدرب. */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'attendance.view');
    const query = attendanceListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await attendanceService.sheet(query, user);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

/** POST — تسجيل حضور فردى (MANUAL/QR/BARCODE/EXTERNAL). */
export const POST = apiRoute({
  body: recordAttendanceSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'attendance.create');
    const record = await attendanceService.record(body, { user, requestId, ip, userAgent });
    return { data: record };
  },
});

/** PATCH — تعديل سجل (نافذة التعديل أو صلاحية attendance.edit_past). */
export const PATCH = apiRoute({
  body: updateAttendanceSchema,
  handler: async ({ user, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'attendance.edit');
    const record = await attendanceService.update(body, { user, requestId, ip, userAgent });
    return { data: record };
  },
});
