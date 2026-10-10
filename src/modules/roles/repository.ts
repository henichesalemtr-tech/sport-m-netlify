import type { Permission, UserRole, UserRolePermission } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';

type Db = typeof prisma | PrismaTransaction;

/** استعلامات الأدوار والصلاحيات — Prisma فقط (4.2). */
export const roleRepository = {
  findAllPermissions(db: Db = prisma): Promise<Permission[]> {
    return db.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  },

  findPermissionsByCodes(codes: string[], db: Db = prisma): Promise<Permission[]> {
    return db.permission.findMany({ where: { code: { in: codes } } });
  },

  findOverridesByRole(
    role: UserRole,
    db: Db = prisma,
  ): Promise<(UserRolePermission & { permission: { code: string } })[]> {
    return db.userRolePermission.findMany({
      where: { role },
      include: { permission: { select: { code: true } } },
    });
  },

  findAllOverrides(db: Db = prisma): Promise<UserRolePermission[]> {
    return db.userRolePermission.findMany({ include: { permission: { select: { code: true } } } });
  },

  async upsertOverride(
    role: UserRole,
    permissionId: string,
    granted: boolean,
    createdBy: string | null,
    db: Db = prisma,
  ): Promise<UserRolePermission> {
    return db.userRolePermission.upsert({
      where: { role_permissionId: { role, permissionId } },
      create: { role, permissionId, granted, createdBy },
      update: { granted, createdBy },
    });
  },
};
