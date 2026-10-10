import { apiRoute } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { settingsService } from '@/modules/settings/service';
import { settingKeyParamSchema, updateSettingBodySchema } from '@/modules/settings/schema';

/** GET /api/v1/settings/[key] — قراءة إعداد واحد (يعيد الافتراضي عند الغياب). */
export const GET = apiRoute({
  params: settingKeyParamSchema,
  handler: async ({ user, params }) => {
    await requirePermission(user, 'settings.manage');
    return { data: await settingsService.get(params.key) };
  },
});

/** PUT /api/v1/settings/[key] — ضبط قيمة إعداد مع Audit. */
export const PUT = apiRoute({
  params: settingKeyParamSchema,
  body: updateSettingBodySchema,
  handler: async ({ user, params, body, requestId, ip, userAgent }) => {
    await requirePermission(user, 'settings.manage');
    const updated = await settingsService.set(params.key, body, { user, requestId, ip, userAgent });
    return { data: updated };
  },
});
