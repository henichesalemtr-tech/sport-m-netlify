import { apiRoute, paginated } from '@/shared/api/route';
import { requirePermission } from '@/shared/permissions/guard';
import { validationError } from '@/shared/errors';
import { importService } from '@/modules/imports/service';
import { importEntitySchema, importListQuerySchema, importModeSchema } from '@/modules/imports/schema';
import { getEntityDef } from '@/modules/imports/entities';
import { z } from 'zod';

export const GET = apiRoute({
  handler: async ({ req, user }) => {
    // القائمة إدارية — تتطلب صلاحية استيراد الرياضيين (الكيان المدعوم حاليًا)
    await requirePermission(user, 'athletes.import');
    const query = importListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const result = await importService.list(query);
    return paginated(result.items, result.total, query.page, query.pageSize);
  },
});

/** رفع ملف استيراد — multipart/form-data (file, entityType, mode?). */
export const POST = apiRoute({
  handler: async ({ req, user, requestId, ip, userAgent }) => {
    const form = await req.formData();
    const file = form.get('file');
    if (file === null || typeof file === 'string') {
      throw validationError({ file: ['الملف مطلوب'] });
    }
    const fields = z
      .object({
        entityType: importEntitySchema,
        mode: importModeSchema.default('skip_invalid'),
      })
      .parse({
        entityType: form.get('entityType') ?? undefined,
        mode: form.get('mode') ?? undefined,
      });

    const def = getEntityDef(fields.entityType);
    if (!def) throw validationError({ entityType: ['نوع كيان غير مدعوم'] });
    await requirePermission(user, def.permission);

    const buffer = Buffer.from(await file.arrayBuffer());
    const job = await importService.upload(
      { originalName: file.name, buffer, entityType: fields.entityType, mode: fields.mode },
      { user, requestId, ip, userAgent },
    );
    return { data: job };
  },
});
