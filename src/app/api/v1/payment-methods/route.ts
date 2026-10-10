import { z } from 'zod';
import { apiRoute } from '@/shared/api/route';
import { prisma } from '@/shared/db/client';
import { hasPermission, requirePermission } from '@/shared/permissions/guard';
import { forbidden } from '@/shared/errors';
import type { PaymentMethodDto } from '@/shared/api/types';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

function toDto(m: { id: string; name: string; isActive: boolean; sortOrder: number }): PaymentMethodDto {
  return { id: m.id, name: m.name, isActive: m.isActive, sortOrder: m.sortOrder };
}

/** GET /api/v1/payment-methods — قائمة طرق الدفع (لمن يملك مدفوعات عرض/إنشاء). */
export const GET = apiRoute({
  handler: async ({ user }) => {
    const allowed =
      (await hasPermission(user, 'payments.view')) || (await hasPermission(user, 'payments.create'));
    if (!allowed) throw forbidden('ليست لديك الصلاحية المطلوبة لهذه العملية');
    const items = await prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { data: items.map(toDto) };
  },
});

/** POST /api/v1/payment-methods — إضافة طريقة دفع (بيانات مرجعية: settings.manage). */
export const POST = apiRoute({
  body: createSchema,
  handler: async ({ user, body }) => {
    await requirePermission(user, 'settings.manage');
    const created = await prisma.paymentMethod.create({
      data: { name: body.name.trim(), sortOrder: body.sortOrder ?? 0 },
    });
    return { data: toDto(created) };
  },
});
