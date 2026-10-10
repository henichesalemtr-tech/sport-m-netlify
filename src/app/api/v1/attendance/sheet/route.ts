import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { validationError } from '@/shared/errors';
import { attendanceService } from '@/modules/attendance/service';
import { attendanceListQuerySchema } from '@/modules/attendance/schema';

/**
 * GET /api/v1/attendance/sheet?groupId=...&from=...&to=...
 * بيانات ورقة الحضور الكاملة: الأعضاء + حصص الفترة + السجلات.
 */
export const GET = apiRoute({
  handler: async ({ req, user }) => {
    await requirePermission(user, 'attendance.view');
    const query = attendanceListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    if (!query.groupId) {
      throw validationError({ groupId: ['معرّف المجموعة إلزامي لورقة الحضور'] });
    }
    const data = await attendanceService.sheetData({ ...query, groupId: query.groupId }, user);
    return { data };
  },
});
