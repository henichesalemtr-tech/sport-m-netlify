import { apiRoute } from '@/shared/api/route';
import { setupService, setupRunSchema } from '@/modules/setup/service';

/** GET /api/v1/setup — هل النظام بحاجة للإعداد الأولي؟ (عام) */
export const GET = apiRoute({
  auth: false,
  handler: async () => {
    return { data: await setupService.getStatus() };
  },
});

/** POST /api/v1/setup — إنشاء أول مدير عام + إعدادات المؤسسة (عام، يُرفض إن وُجد مدير). */
export const POST = apiRoute({
  auth: false,
  body: setupRunSchema,
  handler: async ({ body, requestId, ip, userAgent }) => {
    const result = await setupService.run(body, { requestId, ip, userAgent });
    return { data: result };
  },
});
