import { z } from 'zod';
import { prisma } from '@/shared/db/client';
import { hashPassword, passwordIssues } from '@/shared/auth/password';
import { businessRule, validationError } from '@/shared/errors';

/**
 * وحدة الإعداد الأولي: إنشاء أول مدير عام + إعدادات المؤسسة الأساسية.
 * متاح فقط ما دام لا يوجد SUPER_ADMIN نشط (يُفحص في كل استدعاء — race-safe عبر unique email).
 */

export const setupStatusSchema = z.object({});

export const setupRunSchema = z.object({
  orgName: z.string().min(2).max(200),
  fullName: z.string().min(3).max(200),
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  currencyCode: z.string().min(3).max(10).optional(),
  timezone: z.string().min(2).max(64).optional(),
});

export type SetupRunInput = z.infer<typeof setupRunSchema>;

export interface SetupStatus {
  needsSetup: boolean;
}

async function hasActiveSuperAdmin(): Promise<boolean> {
  const count = await prisma.user.count({
    where: { role: 'SUPER_ADMIN', status: 'ACTIVE', deletedAt: null },
  });
  return count > 0;
}

export const setupService = {
  async getStatus(): Promise<SetupStatus> {
    return { needsSetup: !(await hasActiveSuperAdmin()) };
  },

  async run(input: SetupRunInput, meta: { requestId?: string; ip?: string; userAgent?: string }) {
    if (await hasActiveSuperAdmin()) {
      throw businessRule('تم إعداد النظام مسبقًا — لا يمكن إعادة الإعداد الأولي');
    }
    const issues = passwordIssues(input.password);
    if (issues.length > 0) throw validationError({ password: issues });

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          fullName: input.fullName.trim(),
          passwordHash,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          mustChangePassword: false,
        },
      });

      const settings: Array<{ key: string; value: string; valueType: string; group: string; description: string }> = [
        { key: 'org.name', value: input.orgName.trim(), valueType: 'string', group: 'org', description: 'اسم المنظمة' },
      ];
      if (input.currencyCode) {
        settings.push({
          key: 'currency.code',
          value: input.currencyCode.toUpperCase(),
          valueType: 'string',
          group: 'currency',
          description: 'رمز العملة',
        });
      }
      if (input.timezone) {
        settings.push({
          key: 'timezone',
          value: input.timezone,
          valueType: 'string',
          group: 'general',
          description: 'المنطقة الزمنية للمؤسسة',
        });
      }
      for (const s of settings) {
        await tx.setting.upsert({
          where: { key: s.key },
          create: { ...s, updatedBy: created.id },
          update: { value: s.value, updatedBy: created.id },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: created.id,
          action: 'CREATE',
          entityType: 'Setup',
          entityId: created.id,
          requestId: meta.requestId ?? null,
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
          metadata: JSON.stringify({ operation: 'initial_setup' }),
        },
      });

      return created;
    });

    return { userId: user.id, email: user.email };
  },
};
