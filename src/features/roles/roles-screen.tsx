'use client';

/**
 * شاشة الأدوار والصلاحيات — مصفوفة دور↔صلاحية.
 * - GET /roles → { data: { roles: RoleDto[], permissions: PermissionDto[] } }
 * - PUT /roles/[role]/permissions → body { permissions: [{code, granted}] } (تُرسل الصفوف المتغيرة فقط)
 * بوابة الواجهة: roles.manage (التنفيذ الفعلي في الخادم).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Save } from 'lucide-react';
import { apiPut } from '@/shared/api/client';
import type { PermissionDto, RoleDto, RolesPayload, UserRoleName } from '@/shared/api/types';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { tr } from '@/features/common/tr';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Select } from '@/shared/ui-kit/select';
import { Checkbox } from '@/shared/ui-kit/date-picker';
import { Badge } from '@/shared/ui-kit/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { ErrorText } from '@/shared/ui-kit/form';
import { Loading } from '@/shared/ui-kit/loading';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { useToast } from '@/shared/ui-kit/toast';

export function RolesScreen() {
  const t = useTranslations('role');
  const tu = useTranslations('user');
  const tc = useTranslations('common');
  const toast = useToast();
  const errorText = useErrorText();
  const { can } = useSession();
  const manage = can('roles.manage');

  const roles = useApi<RolesPayload>('/roles');
  const [selected, setSelected] = useState<UserRoleName | ''>('');
  /** مسودة صلاحيات الدور المحدد: code -> granted */
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const payload = roles.data;
  const roleList = useMemo<RoleDto[]>(() => payload?.roles ?? [], [payload]);
  const permissions = useMemo<PermissionDto[]>(() => payload?.permissions ?? [], [payload]);
  const selectedRole = useMemo(
    () => roleList.find((r) => r.role === selected) ?? null,
    [roleList, selected],
  );

  // اختيار أول دور افتراضيًا بعد التحميل
  useEffect(() => {
    if (!selected && roleList.length > 0) setSelected(roleList[0]!.role);
  }, [roleList, selected]);

  // إعادة ضبط المسودة عند تغيير الدور المحدد أو تحميل البيانات
  useEffect(() => {
    if (!selectedRole) {
      setDraft({});
      return;
    }
    const granted = new Set(selectedRole.permissions);
    const next: Record<string, boolean> = {};
    for (const p of permissions) next[p.code] = granted.has(p.code);
    setDraft(next);
    setSaveError(null);
  }, [selectedRole, permissions]);

  /** الصفوف المرتبطة كل صلاحية بموديولها للعرض المجمّع. */
  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const p of permissions) {
      const arr = map.get(p.module);
      if (arr) arr.push(p);
      else map.set(p.module, [p]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const changed = useMemo(() => {
    if (!selectedRole) return [] as { code: string; granted: boolean }[];
    const initial = new Set(selectedRole.permissions);
    const list: { code: string; granted: boolean }[] = [];
    for (const p of permissions) {
      const current = Boolean(draft[p.code]);
      if (current !== initial.has(p.code)) list.push({ code: p.code, granted: current });
    }
    return list;
  }, [selectedRole, permissions, draft]);

  const save = async () => {
    if (!selected || changed.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiPut(`/roles/${selected}/permissions`, { permissions: changed });
      toast.success(
        tr(t, 'saved', 'تم حفظ صلاحيات {role}', {
          role: tr(tu, `roles.${selected}`, selected),
        }),
      );
      roles.reload();
    } catch (e) {
      setSaveError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={tr(t, 'title', 'الأدوار والصلاحيات')}
        subtitle={tr(t, 'matrixHint', 'خصص صلاحيات كل دور؛ الحفظ الفعلي يتم على الخادم')}
      />

      {roles.loading ? <Loading label={tc('loading')} /> : null}
      {roles.error ? <ErrorState message={errorText(roles.error)} onRetry={roles.reload} /> : null}

      {!roles.loading && !roles.error && payload ? (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="w-64">
            <label htmlFor="role-select" className="mb-1 block text-sm font-medium text-foreground">
              {tr(t, 'selectRole', 'اختر الدور')}
            </label>
            <Select
              id="role-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value as UserRoleName | '')}
              options={roleList.map((r) => ({
                value: r.role,
                label: `${tr(tu, `roles.${r.role}`, r.role)}${r.isSystem ? ' ★' : ''}`,
              }))}
            />
          </div>
          {selectedRole?.isSystem ? (
            <Badge label={tr(t, 'lockedHint', 'دور نظامي — قد يملك صلاحيات ثابتة في الخادم')} tone="warning" />
          ) : null}
          {selectedRole ? (
            <span className="text-sm text-muted-foreground">
              {tr(t, 'granted', 'ممنوحة')}: {selectedRole.permissions.length}/{permissions.length}
            </span>
          ) : null}
        </div>
      ) : null}

      {!roles.loading && !roles.error && payload && payload.roles.length === 0 ? (
        <EmptyState title={tc('noData')} />
      ) : null}

      {selectedRole ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{tr(t, 'matrix', 'مصفوفة الصلاحيات')}</CardTitle>
            {saveError ? <ErrorText message={saveError} /> : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {grouped.map(([module, perms]) => (
              <div key={module}>
                <h4 className="mb-1 border-b border-border pb-1 text-xs font-semibold uppercase text-muted-foreground" dir="ltr">
                  {module}
                </h4>
                <ul className="divide-y divide-border">
                  {perms.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                      <div className="min-w-0">
                        <span className="ltr-field block font-mono text-xs" dir="ltr">
                          {p.code}
                        </span>
                        {p.description ? (
                          <span className="block text-xs text-muted-foreground">{p.description}</span>
                        ) : null}
                      </div>
                      <Checkbox
                        aria-label={p.code}
                        checked={Boolean(draft[p.code])}
                        disabled={!manage || saving}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [p.code]: e.target.checked }))}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {manage ? (
              <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">التغييرات: {changed.length}</span>
                <Button type="button" onClick={() => void save()} loading={saving} disabled={changed.length === 0}>
                  <Save className="size-4" aria-hidden />
                  {tr(t, 'saveChanges', 'حفظ صلاحيات الدور')}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
