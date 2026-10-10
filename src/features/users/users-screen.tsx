'use client';

/**
 * شاشة المستخدمون — قائمة + إنشاء/تعديل + تغيير حالة/دور + إعادة ضبط كلمة المرور
 * + الجلسات النشطة + حذف. كل الإجراءات محكومة بصلاحية users.manage (إخفاءً فقط).
 *
 * عقود المسارات المستخدمة (تمت قراءتها من src/app/api/v1/users/*):
 *  - GET/POST /users — listQuery: role?, status? | body createUserSchema
 *  - PATCH /users/[id] — body: {version, email?, username?, fullName?, linkedCoachId?, mustChangePassword?, role?, status?}
 *    (المسار يفرّع: إن وُجد role → changeRole ثم setStatus إن وُجد status؛ وإلا update عادي؛ version إلزامي)
 *  - POST /users/[id]/reset-password — body {newPassword} (min 8)
 *  - GET /users/[id]/sessions — data: UserSessionRow[]
 *  - DELETE /users/[id]/sessions — body {sessionId?} (بدونه تُبطل الكل) — data {revoked:number}
 *  - DELETE /users/[id] — body {version}
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound, Monitor, Pencil, Power, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { UserDto, UserRoleName } from '@/shared/api/types';
import { useList, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { USER_ROLES } from '@/shared/lib/options';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { SearchInput } from '@/shared/ui-kit/search';
import { Select } from '@/shared/ui-kit/select';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { ErrorText } from '@/shared/ui-kit/form';
import { Loading } from '@/shared/ui-kit/loading';
import { useToast } from '@/shared/ui-kit/toast';
import { UserFormModal } from '@/features/users/user-form';

/** شكل عنصر الجلسة من GET /users/[id]/sessions (UserSessionDto — التواريخ ISO بعد التسلسل). */
interface UserSessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  absoluteExp: string;
  isCurrent: boolean;
}

export function UsersScreen() {
  const tu = useTranslations('user');
  const tc = useTranslations('common');
  const ts = useTranslations('status');
  const tToast = useTranslations('ui.toast');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can } = useSession();
  const manage = can('users.manage');

  const list = useList<UserDto>('/users', { sort: '-createdAt' });
  const [filters, setFilters] = useState<{ role?: string; status?: string }>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [deleting, setDeleting] = useState<UserDto | null>(null);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const [sessionsUser, setSessionsUser] = useState<UserDto | null>(null);

  const applyFilters = (next: typeof filters) => {
    list.setFilters({ role: next.role || undefined, status: next.status || undefined });
  };

  const toggleStatus = async (u: UserDto) => {
    try {
      await apiPatch(`/users/${u.id}`, {
        status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
        version: u.version,
      });
      toast.success(tToast('updated'));
      list.reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/users/${deleting.id}`, { version: deleting.version });
      toast.success(tToast('deleted'));
      list.reload();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setDeleting(null);
    }
  };

  const roleLabel = (r: UserRoleName) => tr(tu, `roles.${r}`, r);

  const columns: DataTableColumn<UserDto>[] = [
    {
      key: 'fullName',
      header: tc('fullName'),
      cell: (u) => (
        <span className="flex items-center gap-2 font-medium">
          {u.fullName}
          {u.mustChangePassword ? (
            <Badge label={tr(tu, 'mustChangePassword', 'تغيير كلمة المرور إجباري')} tone="warning" />
          ) : null}
        </span>
      ),
      showInCard: true,
    },
    { key: 'email', header: tc('email'), cell: (u) => <span className="ltr-field">{u.email}</span>, showInCard: true },
    {
      key: 'username',
      header: tr(tu, 'username', 'اسم المستخدم'),
      cell: (u) => (u.username ? <span className="ltr-field font-mono text-xs">{u.username}</span> : '—'),
      showInCard: false,
    },
    { key: 'role', header: tr(tu, 'role', 'الدور'), cell: (u) => <Badge label={roleLabel(u.role)} tone="accent" />, showInCard: true },
    { key: 'status', header: tc('status'), cell: (u) => <StatusBadge value={u.status} />, showInCard: true },
    { header: 'TOTP', cell: (u) => (u.totpEnabled ? tc('yes') : tc('no')), showInCard: false },
    {
      key: 'lastLoginAt',
      header: tr(tu, 'lastLoginAt', 'آخر دخول'),
      cell: (u) =>
        u.lastLoginAt ? (
          <span className="ltr-field text-xs">{fmt.dateTime(u.lastLoginAt)}</span>
        ) : (
          <span className="text-muted-foreground">{tr(tu, 'neverLoggedIn', 'لم يسجّل الدخول بعد')}</span>
        ),
      showInCard: false,
    },
    { key: 'version', header: tc('version'), cell: (u) => <span className="tabular-nums">{u.version}</span>, showInCard: false },
  ];

  if (manage) {
    columns.push({
      header: tc('actions'),
      align: 'end',
      showInCard: true,
      cell: (u) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={tc('edit')}
            title={tc('edit')}
            onClick={() => {
              setEditing(u);
              setFormOpen(true);
            }}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={u.status === 'ACTIVE' ? tr(tu, 'disable', 'تعطيل') : tr(tu, 'enable', 'تفعيل')}
            title={u.status === 'ACTIVE' ? tr(tu, 'disable', 'تعطيل') : tr(tu, 'enable', 'تفعيل')}
            onClick={() => void toggleStatus(u)}
          >
            {u.status === 'ACTIVE' ? <Power className="size-4" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={tr(tu, 'resetPassword', 'إعادة ضبط كلمة المرور')}
            title={tr(tu, 'resetPassword', 'إعادة ضبط كلمة المرور')}
            onClick={() => setResetting(u)}
          >
            <KeyRound className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={tr(tu, 'sessions', 'الجلسات')}
            title={tr(tu, 'sessions', 'الجلسات')}
            onClick={() => setSessionsUser(u)}
          >
            <Monitor className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-destructive"
            aria-label={tc('delete')}
            title={tc('delete')}
            onClick={() => setDeleting(u)}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ),
    });
  }

  return (
    <div>
      <PageHeader
        title={tr(tu, 'titlePlural', 'المستخدمون')}
        actions={
          manage ? (
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="size-4" aria-hidden />
              {tr(tu, 'newUser', 'مستخدم جديد')}
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-52 flex-1">
          <SearchInput value={list.list.q} onSearch={list.setQ} placeholder={`${tr(tu, 'titlePlural', 'المستخدمون')}…`} />
        </div>
        <div className="w-40">
          <Select
            aria-label={tr(tu, 'role', 'الدور')}
            value={filters.role ?? ''}
            placeholder={`${tc('all')} — ${tr(tu, 'role', 'الدور')}`}
            options={USER_ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
            onChange={(e) => {
              const next = { ...filters, role: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
        <div className="w-36">
          <Select
            aria-label={tc('status')}
            value={filters.status ?? ''}
            placeholder={`${tc('all')} — ${tc('status')}`}
            options={[
              { value: 'ACTIVE', label: ts('ACTIVE') },
              { value: 'DISABLED', label: ts('DISABLED') },
            ]}
            onChange={(e) => {
              const next = { ...filters, status: e.target.value };
              setFilters(next);
              applyFilters(next);
            }}
          />
        </div>
      </div>

      <div className="card p-0">
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          getRowId={(u) => u.id}
          loading={list.loading}
          error={list.error ? errorText(list.error) : null}
          onRetry={list.reload}
          sort={list.list.sort}
          onSortChange={list.setSort}
        />
        <Pagination
          page={list.list.page}
          totalPages={list.totalPages}
          total={list.total}
          pageSize={list.list.pageSize}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
      </div>

      {manage ? (
        <>
          <UserFormModal open={formOpen} onOpenChange={setFormOpen} user={editing} onSaved={list.reload} />
          <ResetPasswordModal user={resetting} onOpenChange={(o) => !o && setResetting(null)} />
          <SessionsModal user={sessionsUser} onOpenChange={(o) => !o && setSessionsUser(null)} />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(o) => !o && setDeleting(null)}
            title={tc('delete')}
            message={deleting ? `${deleting.fullName} — ${tr(tu, 'deleteConfirm', 'هل تريد حذف هذا المستخدم؟')}` : ''}
            confirmLabel={tc('delete')}
            onConfirm={() => void confirmDelete()}
          />
        </>
      ) : null}
    </div>
  );
}

// ---------- نافذة إعادة ضبط كلمة المرور ----------

function ResetPasswordModal({ user, onOpenChange }: { user: UserDto | null; onOpenChange: (open: boolean) => void }) {
  const tu = useTranslations('user');
  const tc = useTranslations('common');
  const tv = useTranslations('ui.validation');
  const toast = useToast();
  const errorText = useErrorText();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue('');
    setError(null);
    setBusy(false);
  }, [user]);

  const submit = async () => {
    if (!user) return;
    if (value.length < 8) {
      setError(tv('passwordMin'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/users/${user.id}/reset-password`, { newPassword: value });
      toast.success(tr(tu, 'resetPassword', 'أُعيد ضبط كلمة المرور بنجاح'));
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={user !== null}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
      title={`${tr(tu, 'resetPassword', 'إعادة ضبط كلمة المرور')}${user ? ` — ${user.fullName}` : ''}`}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc('cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} loading={busy}>
            {tc('confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {tr(tu, 'resetPasswordHint', 'سيُطلب من المستخدم تغييرها عند أول دخول')}
        </p>
        <Input
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          invalid={Boolean(error)}
          aria-label={tr(tu, 'resetPassword', 'إعادة ضبط كلمة المرور')}
        />
        {error ? <ErrorText message={error} /> : null}
      </div>
    </Modal>
  );
}

// ---------- نافذة الجلسات النشطة ----------

function SessionsModal({ user, onOpenChange }: { user: UserDto | null; onOpenChange: (open: boolean) => void }) {
  const tu = useTranslations('user');
  const tc = useTranslations('common');
  const toast = useToast();
  const errorText = useErrorText();
  const fmt = useFormatters();
  const [rows, setRows] = useState<UserSessionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchSessions = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<UserSessionRow[]>(`/users/${id}/sessions`);
      setRows(r.data);
    } catch (e) {
      setError(errorText(e));
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setRows(null);
      void fetchSessions(user.id);
    } else {
      setRows(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const revoke = async (sessionId?: string) => {
    if (!user) return;
    setRevoking(true);
    setError(null);
    try {
      // DELETE /users/[id]/sessions — {sessionId} لجلسة محددة، أو {} لإبطال الكل
      const r = await apiDelete<{ revoked: number }>(`/users/${user.id}/sessions`, sessionId ? { sessionId } : {});
      toast.info(`${tr(tu, 'revokeSessions', 'إبطال الجلسات')}: ${r.data.revoked}`);
      await fetchSessions(user.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Modal
      open={user !== null}
      onOpenChange={(o) => {
        if (!revoking) onOpenChange(o);
      }}
      title={`${tr(tu, 'sessions', 'الجلسات')}${user ? ` — ${user.fullName}` : ''}`}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={revoking}>
            {tc('close')}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void revoke(undefined)} loading={revoking}>
            {tr(tu, 'revokeAll', 'إبطال كل الجلسات')}
          </Button>
        </>
      }
    >
      {loading ? <Loading label={tc('loading')} /> : null}
      {!loading && error ? <ErrorText message={error} /> : null}
      {!loading && !error && (rows ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{tc('noData')}</p>
      ) : null}
      {!loading && (rows?.length ?? 0) > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {(rows ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-xs" dir="ltr">
                  {s.userAgent ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="ltr-field">{s.ipAddress ?? '—'}</span>
                  {' · '}
                  <span className="ltr-field">{fmt.dateTime(s.expiresAt)}</span>
                </p>
              </div>
              {s.isCurrent ? (
                <Badge label="الحالية" tone="accent" />
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => void revoke(s.id)} disabled={revoking}>
                  {tr(tu, 'revokeSessions', 'إبطال')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
}
