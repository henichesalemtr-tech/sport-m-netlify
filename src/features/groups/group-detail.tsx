'use client';

/**
 * تفاصيل المجموعة — تبويبا البيانات والأعضاء:
 * إضافة/إزالة/نقل أعضاء مع مؤشر سعة وحوار تجاوز السعة بسبب إلزامي.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Trash2, UserPlus, UserMinus, ArrowLeftRight } from 'lucide-react';
import { ApiClientError, apiDelete, apiGet, apiPost } from '@/shared/api/client';
import type { AthleteDto, GroupDto, GroupMemberDto } from '@/shared/api/types';
import { useApi, useList, useErrorText, useMutation, makeApiMutation } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { todayFor } from '@/shared/lib/format';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui-kit/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select } from '@/shared/ui-kit/select';
import { Textarea } from '@/shared/ui-kit/textarea';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { SearchInput } from '@/shared/ui-kit/search';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { Pagination } from '@/shared/ui-kit/pagination';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { Loading } from '@/shared/ui-kit/loading';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { Field, ErrorText } from '@/shared/ui-kit/form';
import { useToast } from '@/shared/ui-kit/toast';
import { cn } from '@/shared/ui-kit/utils';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium">{value ?? '—'}</span>
    </div>
  );
}

function parseDays(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

export function GroupDetailScreen({ id }: { id: string }) {
  const t = useTranslations('group');
  const tc = useTranslations('common');
  const td = useTranslations('days');
  const errorText = useErrorText();
  const toast = useToast();
  const router = useRouter();
  const fmt = useFormatters();
  const { can, settings } = useSession();

  const group = useApi<GroupDto>(`/groups/${id}`);
  const members = useList<GroupMemberDto>(`/groups/${id}/members`, {
    filters: { active: 'true' },
    sort: '-joinedAt',
  });
  const allGroups = useApi<GroupDto[]>('/groups', { params: { pageSize: 100 } });

  const [deleting, setDeleting] = useState(false);

  // إضافة عضو
  const [addOpen, setAddOpen] = useState(false);
  const [athleteQuery, setAthleteQuery] = useState('');
  const [athleteResults, setAthleteResults] = useState<AthleteDto[]>([]);
  const [searchingAthletes, setSearchingAthletes] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteDto | null>(null);
  const [joinedAt, setJoinedAt] = useState(todayFor(settings));
  const [overrideCapacity, setOverrideCapacity] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // إزالة عضو (بسبب إلزامي)
  const [removing, setRemoving] = useState<GroupMemberDto | null>(null);
  const [leaveReason, setLeaveReason] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);

  // نقل عضو
  const [transferring, setTransferring] = useState<GroupMemberDto | null>(null);
  const [toGroupId, setToGroupId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferOverride, setTransferOverride] = useState(false);
  const [transferOverrideReason, setTransferOverrideReason] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);

  const addMutation = useMutation(
    makeApiMutation<{ athleteId: string; joinedAt: string; overrideCapacity?: boolean; overrideReason?: string }, GroupMemberDto>(
      () => `/groups/${id}/members`,
      'POST',
    ),
  );
  const removeMutation = useMutation(
    makeApiMutation<{ athleteId: string; leaveReason: string }, unknown>(
      () => `/groups/${id}/members`,
      'DELETE',
    ),
  );
  const transferMutation = useMutation(
    makeApiMutation<
      { athleteId: string; toGroupId: string; reason: string; overrideCapacity?: boolean; overrideReason?: string },
      GroupMemberDto
    >(() => `/groups/${id}/transfer`, 'POST'),
  );

  const searchAthletes = async (q: string) => {
    setAthleteQuery(q);
    if (q.trim().length < 2) {
      setAthleteResults([]);
      return;
    }
    setSearchingAthletes(true);
    try {
      const r = await apiGet<AthleteDto[]>('/athletes', { q, pageSize: 8 });
      setAthleteResults(r.data);
    } catch {
      setAthleteResults([]);
    } finally {
      setSearchingAthletes(false);
    }
  };

  const openAdd = () => {
    setSelectedAthlete(null);
    setAthleteQuery('');
    setAthleteResults([]);
    setJoinedAt(todayFor(settings));
    setOverrideCapacity(false);
    setOverrideReason('');
    setAddError(null);
    setAddOpen(true);
  };

  const doAdd = async () => {
    if (!selectedAthlete) return;
    setAddError(null);
    const result = await addMutation.mutate({
      athleteId: selectedAthlete.id,
      joinedAt,
      overrideCapacity: overrideCapacity || undefined,
      overrideReason: overrideCapacity ? overrideReason.trim() : undefined,
    });
    if (result) {
      toast.success(t('addMember'));
      setAddOpen(false);
      members.reload();
      group.reload();
    } else if (addMutation.error) {
      const e = addMutation.error;
      if (e instanceof ApiClientError && e.code === 'CAPACITY_EXCEEDED' && can('groups.override_capacity')) {
        // سعة ممتلئة — اطلب سبب التجاوز
        setOverrideCapacity(true);
      }
      setAddError(errorText(e));
    }
  };

  const doRemove = async () => {
    if (!removing) return;
    if (leaveReason.trim().length < 3) {
      setRemoveError(t('leaveReason'));
      return;
    }
    setRemoveError(null);
    const result = await removeMutation.mutate({ athleteId: removing.athleteId, leaveReason: leaveReason.trim() });
    if (result !== null) {
      toast.success(t('removeMember'));
      setRemoving(null);
      members.reload();
      group.reload();
    } else if (removeMutation.error) {
      setRemoveError(errorText(removeMutation.error));
    }
  };

  const doTransfer = async () => {
    if (!transferring) return;
    if (!toGroupId || transferReason.trim().length < 5) {
      setTransferError(tc('required'));
      return;
    }
    setTransferError(null);
    const result = await transferMutation.mutate({
      athleteId: transferring.athleteId,
      toGroupId,
      reason: transferReason.trim(),
      overrideCapacity: transferOverride || undefined,
      overrideReason: transferOverride ? transferOverrideReason.trim() : undefined,
    });
    if (result) {
      toast.success(t('transfer'));
      setTransferring(null);
      members.reload();
      group.reload();
    } else if (transferMutation.error) {
      setTransferError(errorText(transferMutation.error));
    }
  };

  const doDelete = async () => {
    try {
      await apiDelete(`/groups/${id}`, { version: group.data?.version ?? 0 });
      toast.success(tc('deleted'));
      router.push('/groups');
    } catch (e) {
      toast.error(errorText(e));
      setDeleting(false);
    }
  };

  if (group.loading) return <Loading label={tc('loading')} />;
  if (group.error) return <ErrorState message={errorText(group.error)} onRetry={group.reload} />;
  if (!group.data) return <EmptyState />;

  const g = group.data;
  const current = g.membersCount ?? g._count?.members ?? 0;
  const isFull = current >= g.maxCapacity;
  const days = parseDays(g.trainingDays);

  const memberColumns: DataTableColumn<GroupMemberDto>[] = [
    {
      header: tc('fullName'),
      cell: (m) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">
            {m.athlete.firstName} {m.athlete.lastName}
          </span>
          <span className="ltr-field font-mono text-xs text-muted-foreground">{m.athlete.registrationNo}</span>
        </span>
      ),
      showInCard: true,
    },
    { header: tc('status'), cell: (m) => <StatusBadge value={m.athlete.status} />, showInCard: false },
    { key: 'joinedAt', header: t('joinedAt'), cell: (m) => fmt.date(m.joinedAt) },
    { header: t('leftAt'), cell: (m) => (m.leftAt ? fmt.date(m.leftAt) : '—'), showInCard: false },
    {
      header: tc('actions'),
      align: 'end',
      cell: (m) =>
        can('groups.manage_members') && !m.leftAt ? (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t('transfer')}
              onClick={() => {
                setTransferring(m);
                setToGroupId('');
                setTransferReason('');
                setTransferOverride(false);
                setTransferOverrideReason('');
                setTransferError(null);
              }}
            >
              <ArrowLeftRight className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-destructive"
              aria-label={t('removeMember')}
              onClick={() => {
                setRemoving(m);
                setLeaveReason('');
                setRemoveError(null);
              }}
            >
              <UserMinus className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null,
      showInCard: true,
    },
  ];

  return (
    <div>
      <PageHeader
        title={g.name}
        subtitle={`${t('code')}: ${g.code}`}
        backHref="/groups"
        backLabel={tc('back')}
        actions={
          <>
            {can('groups.edit') ? (
              <Button type="button" variant="outline" onClick={() => router.push(`/groups/${g.id}/edit`)}>
                <Pencil className="size-4" aria-hidden />
                {tc('edit')}
              </Button>
            ) : null}
            {can('groups.delete') ? (
              <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
                <Trash2 className="size-4" aria-hidden />
                {tc('delete')}
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={g.status} />
              {g.sport ? <Badge label={g.sport.name} tone="accent" /> : null}
              {g.ageCategory ? <Badge label={g.ageCategory.name} /> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {g.coach ? `${t('coach')}: ${g.coach.firstName} ${g.coach.lastName}` : tc('none')}
              {g.venue ? ` · ${t('venue')}: ${g.venue.name}` : ''}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{t('capacity')}</p>
            <p className={cn('text-sm font-bold tabular-nums', isFull && 'text-warning')}>
              {t('capacityUsage', { current: fmt.number(current), max: fmt.number(g.maxCapacity) })}
            </p>
            <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className={cn('block h-full rounded-full', isFull ? 'bg-warning' : 'bg-primary')}
                style={{ width: `${Math.min(100, g.maxCapacity > 0 ? (current / g.maxCapacity) * 100 : 0)}%` }}
              />
            </span>
            {isFull ? <Badge label={t('full')} tone="warning" className="mt-1" /> : null}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">{t('infoTab')}</TabsTrigger>
          <TabsTrigger value="members">{t('members')}</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('schedule')}</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow
                  label={t('trainingDays')}
                  value={days.length > 0 ? days.map((d) => td(d)).join('، ') : tc('none')}
                />
                <InfoRow
                  label={t('startTime')}
                  value={g.startTime ? <span className="ltr-field">{g.startTime.slice(0, 5)}</span> : '—'}
                />
                <InfoRow
                  label={t('endTime')}
                  value={g.endTime ? <span className="ltr-field">{g.endTime.slice(0, 5)}</span> : '—'}
                />
                <InfoRow label={t('venue')} value={g.venue?.name ?? tc('none')} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{tc('details')}</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label={t('sport')} value={g.sport?.name ?? tc('none')} />
                <InfoRow label={t('coach')} value={g.coach ? `${g.coach.firstName} ${g.coach.lastName}` : tc('none')} />
                <InfoRow label={tc('status')} value={<StatusBadge value={g.status} />} />
                <InfoRow label={tc('notes')} value={g.notes ?? '—'} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="members">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select
                aria-label={t('members')}
                value={String(members.list.filters.active ?? 'true')}
                options={[
                  { value: 'true', label: t('activeMember') },
                  { value: 'false', label: t('formerMember') },
                  { value: 'all', label: tc('all') },
                ]}
                onChange={(e) => members.setFilters({ active: e.target.value })}
              />
            </div>
            {can('groups.manage_members') ? (
              <Button type="button" onClick={openAdd}>
                <UserPlus className="size-4" aria-hidden />
                {t('addMember')}
              </Button>
            ) : null}
          </div>
          <div className="card p-0">
            <DataTable
              columns={memberColumns}
              rows={members.data ?? []}
              getRowId={(m) => m.id}
              loading={members.loading}
              error={members.error ? errorText(members.error) : null}
              onRetry={members.reload}
              emptyTitle={t('noMembers')}
              onRowClick={(m) => router.push(`/athletes/${m.athleteId}`)}
            />
            <Pagination
              page={members.list.page}
              totalPages={members.totalPages}
              total={members.total}
              pageSize={members.list.pageSize}
              onPageChange={members.setPage}
              onPageSizeChange={members.setPageSize}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* إضافة عضو */}
      <Modal
        open={addOpen}
        onOpenChange={(o) => !addMutation.pending && setAddOpen(o)}
        title={t('addMember')}
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={addMutation.pending}>
              {tc('cancel')}
            </Button>
            <Button type="button" onClick={() => void doAdd()} loading={addMutation.pending} disabled={!selectedAthlete}>
              {tc('add')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {addError ? <ErrorText message={addError} /> : null}
          {selectedAthlete ? (
            <div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
              <span>
                <span className="font-medium">
                  {selectedAthlete.firstName} {selectedAthlete.lastName}
                </span>
                <span className="ltr-field ms-2 font-mono text-xs text-muted-foreground">
                  {selectedAthlete.registrationNo}
                </span>
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedAthlete(null)}>
                {tc('clear')}
              </Button>
            </div>
          ) : (
            <div>
              <SearchInput
                value={athleteQuery}
                onSearch={(q) => void searchAthletes(q)}
                placeholder={t('selectAthlete') + '…'}
              />
              {searchingAthletes ? <Loading label={tc('loading')} /> : null}
              {athleteResults.length > 0 ? (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {athleteResults.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>
                        {a.firstName} {a.lastName}
                        <span className="ltr-field ms-2 font-mono text-xs text-muted-foreground">{a.registrationNo}</span>
                      </span>
                      <Button type="button" size="sm" variant="outline" onClick={() => setSelectedAthlete(a)}>
                        {tc('add')}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          <Field label={t('joinedAt')} htmlFor="m-joined">
            <DatePicker id="m-joined" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
          </Field>
          {isFull ? (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              {t('full')} — {t('overrideCapacity')}
            </p>
          ) : null}
          {overrideCapacity ? (
            <Field label={t('overrideReason')} htmlFor="m-override" required>
              <Textarea
                id="m-override"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                invalid={overrideReason.trim().length > 0 && overrideReason.trim().length < 5}
              />
            </Field>
          ) : isFull && can('groups.override_capacity') ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setOverrideCapacity(true)}>
              {t('overrideCapacity')}
            </Button>
          ) : null}
        </div>
      </Modal>

      {/* إزالة عضو — سبب إلزامي */}
      <Modal
        open={removing !== null}
        onOpenChange={(o) => !o && !removeMutation.pending && setRemoving(null)}
        title={t('removeMember')}
        description={removing ? `${removing.athlete.firstName} ${removing.athlete.lastName}` : undefined}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setRemoving(null)} disabled={removeMutation.pending}>
              {tc('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void doRemove()}
              loading={removeMutation.pending}
              disabled={leaveReason.trim().length < 3}
            >
              {t('removeMember')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {removeError ? <ErrorText message={removeError} /> : null}
          <p className="text-sm text-muted-foreground">
            {removing ? t('removeMemberConfirm', { name: `${removing.athlete.firstName} ${removing.athlete.lastName}` }) : ''}
          </p>
          <Field label={t('leaveReason')} htmlFor="m-leave" required>
            <Textarea id="m-leave" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* نقل عضو إلى مجموعة أخرى */}
      <Modal
        open={transferring !== null}
        onOpenChange={(o) => !o && !transferMutation.pending && setTransferring(null)}
        title={t('transfer')}
        description={transferring ? `${transferring.athlete.firstName} ${transferring.athlete.lastName}` : undefined}
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTransferring(null)}
              disabled={transferMutation.pending}
            >
              {tc('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void doTransfer()}
              loading={transferMutation.pending}
              disabled={!toGroupId || transferReason.trim().length < 5}
            >
              {t('transfer')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {transferError ? <ErrorText message={transferError} /> : null}
          <Field label={t('transferTo')} htmlFor="m-togroup" required>
            <Select
              id="m-togroup"
              value={toGroupId}
              onChange={(e) => setToGroupId(e.target.value)}
              placeholder={tc('none')}
              options={(allGroups.data ?? [])
                .filter((x) => x.id !== id)
                .map((x) => ({ value: x.id, label: `${x.name} (${x.code})` }))}
            />
          </Field>
          <Field label={tc('reason')} htmlFor="m-treason" required>
            <Textarea id="m-treason" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
          </Field>
          {can('groups.override_capacity') ? (
            <div className="space-y-2">
              <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border"
                  checked={transferOverride}
                  onChange={(e) => setTransferOverride(e.target.checked)}
                />
                {t('overrideCapacity')}
              </label>
              {transferOverride ? (
                <Field label={t('overrideReason')} htmlFor="m-toverride" required>
                  <Input
                    id="m-toverride"
                    value={transferOverrideReason}
                    onChange={(e) => setTransferOverrideReason(e.target.value)}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={tc('delete')}
        message={t('deleteConfirm')}
        confirmLabel={tc('delete')}
        onConfirm={() => void doDelete()}
      />
    </div>
  );
}
