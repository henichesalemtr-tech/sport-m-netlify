import type { UserRole } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { businessRule, notFound } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { allPermissionCodes, roleHasPermissionDefault } from '@/shared/permissions/catalog';
import { roleRepository } from './repository';
import type { UpdateRolePermissionsInput } from './schema';

const ENTITY = 'UserRolePermission';

/** كل الأدوار النظامية (من المخطط — لا نصوص صلبة في التفويض). */
export const SYSTEM_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPTION',
  'COACH',
  'ACCOUNTANT',
  'VIEWER',
] as const;

export interface RoleDto {
  role: UserRole;
  /** هل صلاحيات الدور قابلة للتخصيص (SUPER_ADMIN ثابت على الكل). */
  customizable: boolean;
  permissions: string[];
  overrides: { code: string; granted: boolean }[];
}

export interface PermissionDto {
  code: string;
  module: string;
  description: string | null;
  isSystem: boolean;
  existsInDb: boolean;
}

export interface RoleMatrixRow {
  role: UserRole;
  grants: Record<string, boolean>;
}

/** الصلاحيات الفعلية لدور = الافتراضي (الكتالوج) ± تخصيصات DB. دالة نقية. */
export function effectivePermissions(
  role: UserRole,
  codes: string[],
  overrides: { code: string; granted: boolean }[],
): string[] {
  const set = new Set<string>();
  for (const code of codes) {
    if (roleHasPermissionDefault(role, code)) set.add(code);
  }
  for (const o of overrides) {
    if (o.granted) set.add(o.code);
    else set.delete(o.code);
  }
  return [...set].sort();
}

export const roleService = {
  /** قائمة الأدوار مع صلاحياتها الفعلية وتخصيصاتها. */
  async listRoles(): Promise<RoleDto[]> {
    const codes = allPermissionCodes();
    const allOverrides = await roleRepository.findAllOverrides();
    return SYSTEM_ROLES.map((role) => {
      const overrides = allOverrides
        .filter((o) => o.role === role)
        .map((o) => ({ code: o.permission.code, granted: o.granted }));
      return {
        role,
        customizable: role !== 'SUPER_ADMIN',
        permissions: effectivePermissions(role, codes, overrides),
        overrides,
      };
    });
  },

  /** كل الصلاحيات المعروفة (الكتالوج + صفوف DB). */
  async listPermissions(): Promise<PermissionDto[]> {
    const rows = await roleRepository.findAllPermissions();
    const byCode = new Map(rows.map((r) => [r.code, r] as const));
    const codes = new Set<string>([...allPermissionCodes(), ...rows.map((r) => r.code)]);
    return [...codes].sort().map((code) => {
      const row = byCode.get(code);
      return {
        code,
        module: row?.module ?? code.split('.')[0] ?? code,
        description: row?.description ?? null,
        isSystem: row?.isSystem ?? true,
        existsInDb: row !== undefined,
      };
    });
  },

  /** مصفوفة دور × صلاحية (القيم الفعلية بعد التخصيص). */
  async getMatrix(): Promise<{ permissions: string[]; roles: RoleMatrixRow[] }> {
    const codes = allPermissionCodes();
    const allOverrides = await roleRepository.findAllOverrides();
    const roles = SYSTEM_ROLES.map((role) => {
      const overrides = allOverrides
        .filter((o) => o.role === role)
        .map((o) => ({ code: o.permission.code, granted: o.granted }));
      const effective = new Set(effectivePermissions(role, codes, overrides));
      const grants: Record<string, boolean> = {};
      for (const code of codes) grants[code] = effective.has(code);
      return { role, grants };
    });
    return { permissions: codes, roles };
  },

  /** صلاحيات دور واحد (لمسار /roles/[role]/permissions). */
  async getRolePermissions(role: UserRole): Promise<RoleDto> {
    const roles = await this.listRoles();
    const found = roles.find((r) => r.role === role);
    if (!found) throw notFound('الدور');
    return found;
  },

  /**
   * تحديث تخصيصات صلاحيات دور (Upsert UserRolePermission).
   * SUPER_ADMIN غير قابل للتخصيص (صلاحياته الكاملة ثابتة — حماية نظامية وليس تفويضًا).
   */
  async updateRolePermissions(
    role: UserRole,
    input: UpdateRolePermissionsInput,
    meta: Meta,
  ): Promise<RoleDto> {
    if (role === 'SUPER_ADMIN') {
      throw businessRule('لا يمكن تعديل صلاحيات دور المدير العام — يملك كل الصلاحيات دائمًا');
    }

    const known = new Set(allPermissionCodes());
    for (const entry of input.permissions) {
      if (!known.has(entry.code)) throw notFound(`الصلاحية ${entry.code}`);
    }

    return prisma.$transaction(async (tx) => {
      const codes = input.permissions.map((p) => p.code);
      const rows = await roleRepository.findPermissionsByCodes(codes, tx);
      const byCode = new Map(rows.map((r) => [r.code, r] as const));
      for (const code of codes) {
        if (!byCode.has(code)) throw notFound(`الصلاحية ${code} (غير مزروعة في جدول permissions)`);
      }

      const affectedIds = new Set(rows.map((r) => r.id));
      const beforeOverrides = await roleRepository.findOverridesByRole(role, tx);
      const before = beforeOverrides
        .filter((o) => affectedIds.has(o.permissionId))
        .map((o) => ({ code: o.permission.code, granted: o.granted }));

      for (const entry of input.permissions) {
        const permission = byCode.get(entry.code);
        if (!permission) throw notFound(`الصلاحية ${entry.code}`);
        await roleRepository.upsertOverride(role, permission.id, entry.granted, meta.user.userId, tx);
      }

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'PERMISSION_CHANGE',
          entityType: ENTITY,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before,
          after: input.permissions,
          metadata: { role },
        },
        tx,
      );

      const overrides = (await roleRepository.findOverridesByRole(role, tx)).map((o) => ({
        code: o.permission.code,
        granted: o.granted,
      }));
      return {
        role,
        customizable: true,
        permissions: effectivePermissions(role, allPermissionCodes(), overrides),
        overrides,
      };
    });
  },
};
