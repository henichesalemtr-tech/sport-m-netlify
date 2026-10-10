import { describe, expect, it } from 'vitest';
import type { UserRole, UserStatus } from '@prisma/client';
import { isEffectiveSuperAdmin, wouldRemoveLastSuperAdmin, type SuperAdminState } from './policy';

const state = (
  role: UserRole,
  status: UserStatus = 'ACTIVE',
  deletedAt: Date | null = null,
): SuperAdminState => ({ role, status, deletedAt });

describe('حماية آخر مدير عام', () => {
  it('المدير العام الفعّال = SUPER_ADMIN + ACTIVE + غير محذوف', () => {
    expect(isEffectiveSuperAdmin(state('SUPER_ADMIN'))).toBe(true);
    expect(isEffectiveSuperAdmin(state('SUPER_ADMIN', 'DISABLED'))).toBe(false);
    expect(isEffectiveSuperAdmin(state('SUPER_ADMIN', 'ACTIVE', new Date()))).toBe(false);
    expect(isEffectiveSuperAdmin(state('ADMIN'))).toBe(false);
  });

  it('يمنع تخفيض دور آخر مدير عام فعّال', () => {
    expect(wouldRemoveLastSuperAdmin(state('SUPER_ADMIN'), state('ADMIN'), 1)).toBe(true);
  });

  it('يسمح بالتخفيض إن وجد مدير عام فعّال آخر', () => {
    expect(wouldRemoveLastSuperAdmin(state('SUPER_ADMIN'), state('ADMIN'), 2)).toBe(false);
  });

  it('يمنع تعطيل أو حذف آخر مدير عام فعّال', () => {
    expect(
      wouldRemoveLastSuperAdmin(state('SUPER_ADMIN'), state('SUPER_ADMIN', 'DISABLED'), 1),
    ).toBe(true);
    expect(
      wouldRemoveLastSuperAdmin(state('SUPER_ADMIN'), state('SUPER_ADMIN', 'ACTIVE', new Date()), 1),
    ).toBe(true);
  });

  it('لا يؤثر على غير المديرين العامين', () => {
    expect(wouldRemoveLastSuperAdmin(state('ADMIN'), state('VIEWER'), 1)).toBe(false);
    expect(wouldRemoveLastSuperAdmin(state('ADMIN'), state('VIEWER'), 0)).toBe(false);
  });

  it('يسمح بالترقية/التعديل الذي يبقي الدور SUPER_ADMIN فعّالًا', () => {
    expect(wouldRemoveLastSuperAdmin(state('SUPER_ADMIN'), state('SUPER_ADMIN'), 1)).toBe(false);
    expect(wouldRemoveLastSuperAdmin(state('ADMIN'), state('SUPER_ADMIN'), 1)).toBe(false);
  });
});
