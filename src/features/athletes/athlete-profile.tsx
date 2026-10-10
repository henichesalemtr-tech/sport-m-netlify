'use client';

/** الملف الشخصي للرياضي — تبويبات: بيانات/اشتراكات/مدفوعات/حضور/مجموعات/تقييمات/وثائق/خط زمني. */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Printer, Trash2 } from 'lucide-react';
import { apiDelete } from '@/shared/api/client';
import type { AthleteProfile, EvaluationTimeSeries } from '@/shared/api/types';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui-kit/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';
import { Button } from '@/shared/ui-kit/button';
import { Chart } from '@/shared/ui-kit/chart';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { Loading } from '@/shared/ui-kit/loading';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { useToast } from '@/shared/ui-kit/toast';
import { Link } from '@/shared/i18n/navigation';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium">{value ?? '—'}</span>
    </div>
  );
}

export function AthleteProfileScreen({ id }: { id: string }) {
  const t = useTranslations('athlete');
  const tc = useTranslations('common');
  const tsub = useTranslations('subscription');
  const tpay = useTranslations('payment');
  const tatt = useTranslations('attendance');
  const tev = useTranslations('evaluation');
  const tdoc = useTranslations('document');
  const errorText = useErrorText();
  const toast = useToast();
  const router = useRouter();
  const fmt = useFormatters();
  const { can } = useSession();

  const profile = useApi<AthleteProfile>(`/athletes/${id}/profile`);
  const series = useApi<EvaluationTimeSeries>(
    can('evaluations.view') ? '/evaluations/time-series' : null,
    { params: { athleteId: id } },
  );
  const [deleting, setDeleting] = useState(false);

  if (profile.loading) return <Loading label={tc('loading')} />;
  if (profile.error) return <ErrorState message={errorText(profile.error)} onRetry={profile.reload} />;
  if (!profile.data) return <EmptyState />;

  const { athlete, subscriptions, payments, finances, attendance, groups, evaluations, documents, timeline } =
    profile.data;

  const doDelete = async () => {
    try {
      await apiDelete(`/athletes/${athlete.id}`, { version: athlete.version });
      toast.success(tc('deleted'));
      router.push('/athletes');
    } catch (e) {
      toast.error(errorText(e));
      setDeleting(false);
    }
  };

  const subColumns: DataTableColumn<(typeof subscriptions)[number]>[] = [
    { header: tsub('subscriptionType'), cell: (s) => s.typeName },
    { header: tsub('startDate'), cell: (s) => `${fmt.date(s.startDate)} → ${fmt.date(s.endDate)}` },
    { header: tsub('dueDate'), cell: (s) => fmt.date(s.dueDate), showInCard: false },
    { header: tsub('netAmount'), cell: (s) => fmt.money(s.netAmount), align: 'end' },
    { header: tsub('paidAmount'), cell: (s) => fmt.money(s.paidAmount), align: 'end', showInCard: false },
    { header: tsub('remaining'), cell: (s) => fmt.money(s.remainingAmount), align: 'end' },
    {
      header: tsub('sessionsTotal'),
      cell: (s) => (s.sessionsTotal !== null ? `${s.sessionsUsed}/${s.sessionsTotal}` : '—'),
      showInCard: false,
    },
    { header: tc('status'), cell: (s) => <StatusBadge value={s.status} /> },
  ];

  const payColumns: DataTableColumn<(typeof payments)[number]>[] = [
    { header: tpay('transactionNo'), cell: (p) => <span className="ltr-field font-mono text-xs">{p.transactionNo}</span> },
    { header: tpay('paymentDate'), cell: (p) => fmt.date(p.paymentDate) },
    { header: tpay('method'), cell: (p) => p.method, showInCard: false },
    { header: tc('amount'), cell: (p) => fmt.money(p.amount), align: 'end' },
    { header: tc('status'), cell: (p) => <StatusBadge value={p.status} /> },
    {
      header: tc('actions'),
      align: 'end',
      cell: (p) =>
        can('payments.view') ? (
          <Link href={`/payments?q=${encodeURIComponent(p.transactionNo)}`} className="text-sm text-primary hover:underline">
            {tc('view')}
          </Link>
        ) : null,
      showInCard: true,
    },
  ];

  const groupColumns: DataTableColumn<(typeof groups)[number]>[] = [
    { header: t('group'), cell: (g) => g.name },
    { header: t('sport'), cell: (g) => g.sportName, showInCard: false },
    { header: t('memberSince'), cell: (g) => fmt.date(g.joinedAt) },
    {
      header: tc('status'),
      cell: (g) =>
        g.isActive ? <Badge label={t('activeMember')} tone="success" /> : <Badge label={t('formerMember')} tone="muted" />,
    },
  ];

  const docColumns: DataTableColumn<(typeof documents)[number]>[] = [
    { header: tdoc('documentType'), cell: (d) => d.typeName },
    { header: tdoc('originalName'), cell: (d) => d.originalName, showInCard: false },
    { header: tdoc('expiryDate'), cell: (d) => fmt.date(d.expiryDate) },
    { header: tc('createdAt'), cell: (d) => fmt.date(d.createdAt), showInCard: false },
    { header: tc('status'), cell: (d) => <StatusBadge value={d.status} /> },
    {
      header: tc('actions'),
      align: 'end',
      cell: (d) =>
        can('documents.view') ? (
          <a
            href={`/api/v1/documents/${d.id}/download`}
            className="text-sm text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {tc('download')}
          </a>
        ) : null,
      showInCard: true,
    },
  ];

  const progressData = (series.data?.points ?? []).map((p) => ({
    name: fmt.date(p.date),
    value: p.average,
  }));

  return (
    <div>
      <PageHeader
        title={`${athlete.firstName} ${athlete.lastName}`}
        subtitle={`${t('registrationNo')}: ${athlete.registrationNo}`}
        backHref="/athletes"
        backLabel={tc('back')}
        actions={
          <>
            <Link href={`/print/athlete-card/${athlete.id}`} target="_blank">
              <Button type="button" variant="outline">
                <Printer className="size-4" aria-hidden />
                {t('printCard')}
              </Button>
            </Link>
            {can('athletes.edit') ? (
              <Button type="button" variant="outline" onClick={() => router.push(`/athletes/${athlete.id}/edit`)}>
                <Pencil className="size-4" aria-hidden />
                {tc('edit')}
              </Button>
            ) : null}
            {can('athletes.delete') && !athlete.deletedAt ? (
              <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
                <Trash2 className="size-4" aria-hidden />
                {tc('delete')}
              </Button>
            ) : null}
          </>
        }
      />

      {/* بطاقة تعريفية */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-4">
          {athlete.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={athlete.photoUrl} alt="" className="size-16 rounded-xl object-cover" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-xl bg-primary/10 text-xl font-bold text-primary">
              {athlete.firstName[0]}
              {athlete.lastName[0]}
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={athlete.status} />
              {athlete.sport ? <Badge label={athlete.sport.name} tone="accent" /> : null}
              {athlete.ageCategory ? <Badge label={athlete.ageCategory.name} /> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {t('memberSince')} {fmt.date(athlete.registrationDate)} ·{' '}
              {groups.some((g) => g.isActive) ? t('activeMember') : t('noGroups')}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">{t('totalNet')}</p>
              <p className="text-sm font-bold tabular-nums">{fmt.money(finances.totalNet)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('totalPaid')}</p>
              <p className="text-sm font-bold text-success tabular-nums">{fmt.money(finances.totalPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('totalDue')}</p>
              <p className="text-sm font-bold text-destructive tabular-nums">{fmt.money(finances.totalDue)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">{t('tabInfo')}</TabsTrigger>
          <TabsTrigger value="subs">{t('tabSubscriptions')}</TabsTrigger>
          <TabsTrigger value="pays">{t('tabPayments')}</TabsTrigger>
          <TabsTrigger value="att">{t('tabAttendance')}</TabsTrigger>
          <TabsTrigger value="groups">{t('tabGroups')}</TabsTrigger>
          <TabsTrigger value="evals">{t('tabEvaluations')}</TabsTrigger>
          <TabsTrigger value="docs">{t('tabDocuments')}</TabsTrigger>
          <TabsTrigger value="timeline">{t('tabTimeline')}</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('basicInfo')}</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label={t('registrationNo')} value={<span className="ltr-field">{athlete.registrationNo}</span>} />
                <InfoRow label={tc('fullName')} value={`${athlete.firstName} ${athlete.lastName}`} />
                <InfoRow label={t('gender')} value={athlete.gender === 'MALE' ? tc('male') : tc('female')} />
                <InfoRow label={t('birthDate')} value={`${fmt.date(athlete.birthDate)}`} />
                <InfoRow label={t('sport')} value={athlete.sport?.name ?? tc('none')} />
                <InfoRow label={t('ageCategory')} value={athlete.ageCategory?.name ?? tc('none')} />
                <InfoRow label={t('status')} value={<StatusBadge value={athlete.status} />} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('contactInfo')}</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label={tc('phone')} value={athlete.phone ? <span className="ltr-field">{athlete.phone}</span> : '—'} />
                <InfoRow label={tc('email')} value={athlete.email ? <span className="ltr-field">{athlete.email}</span> : '—'} />
                <InfoRow label={tc('address')} value={athlete.address ?? '—'} />
                <InfoRow label={t('emergencyName')} value={athlete.emergencyName ?? '—'} />
                <InfoRow
                  label={t('emergencyPhone')}
                  value={athlete.emergencyPhone ? <span className="ltr-field">{athlete.emergencyPhone}</span> : '—'}
                />
                <InfoRow label={t('imageConsent')} value={athlete.imageConsent ? tc('yes') : tc('no')} />
                {can('athletes.view_sensitive') ? (
                  <>
                    <InfoRow label={t('bloodType')} value={athlete.bloodType ?? '—'} />
                    <InfoRow label={t('allergies')} value={athlete.allergies ?? '—'} />
                    <InfoRow label={t('medicalNotes')} value={athlete.medicalNotes ?? '—'} />
                  </>
                ) : null}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">{t('parents')}</CardTitle>
              </CardHeader>
              <CardContent>
                {athlete.parents.length === 0 ? (
                  <EmptyState title={t('parents')} className="min-h-16 p-2" />
                ) : (
                  <ul className="divide-y divide-border">
                    {athlete.parents.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span>
                          {p.parent.firstName} {p.parent.lastName}
                          <span className="ltr-field ms-2 text-xs text-muted-foreground">{p.parent.phone}</span>
                          {p.relationship ? <span className="ms-2 text-xs text-muted-foreground">({p.relationship})</span> : null}
                        </span>
                        <span className="flex gap-1">
                          {p.isPrimary ? <Badge label={t('primary')} tone="accent" /> : null}
                          {p.isPayer ? <Badge label={t('payer')} tone="success" /> : null}
                          {p.isEmergency ? <Badge label={t('emergency')} tone="warning" /> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subs">
          <div className="card p-0">
            <DataTable
              columns={subColumns}
              rows={subscriptions}
              getRowId={(s) => s.id}
              emptyTitle={tc('noData')}
            />
          </div>
        </TabsContent>

        <TabsContent value="pays">
          <div className="card p-0">
            <DataTable columns={payColumns} rows={payments} getRowId={(p) => p.id} emptyTitle={tc('noData')} />
          </div>
        </TabsContent>

        <TabsContent value="att">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">{t('attendanceRate')}</p>
                <p className="text-xl font-bold text-primary tabular-nums">{fmt.percent(attendance.ratePercent)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">{t('presentCount')}</p>
                <p className="text-xl font-bold text-success tabular-nums">{fmt.number(attendance.PRESENT)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">{t('absentCount')}</p>
                <p className="text-xl font-bold text-destructive tabular-nums">{fmt.number(attendance.ABSENT)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">{t('lateCount')}</p>
                <p className="text-xl font-bold text-warning tabular-nums">{fmt.number(attendance.LATE)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">{t('excusedCount')}</p>
                <p className="text-xl font-bold tabular-nums">{fmt.number(attendance.EXCUSED)}</p>
              </CardContent>
            </Card>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {tatt('title')}: {fmt.number(attendance.total)}
          </p>
        </TabsContent>

        <TabsContent value="groups">
          <div className="card p-0">
            <DataTable columns={groupColumns} rows={groups} getRowId={(g) => g.id} emptyTitle={t('noGroups')} />
          </div>
        </TabsContent>

        <TabsContent value="evals">
          {can('evaluations.view') ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t('progress')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Chart
                    kind="line"
                    data={progressData}
                    loading={series.loading}
                    error={series.error ? errorText(series.error) : null}
                    onRetry={series.reload}
                    seriesLabel={tev('average')}
                    valueFormatter={fmt.number}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t('progressHint')}</p>
                </CardContent>
              </Card>
              {evaluations.length === 0 ? (
                <EmptyState title={t('noEvaluations')} />
              ) : (
                evaluations.map((ev) => {
                  const scores = typeof ev.scores === 'string' ? {} : (ev.scores as Record<string, number>);
                  return (
                    <Card key={ev.id}>
                      <CardHeader>
                        <CardTitle className="text-sm">{ev.templateName}</CardTitle>
                        <span className="text-xs text-muted-foreground">
                          {ev.coachName} · {fmt.date(ev.evaluationDate)}
                        </span>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(scores).map(([k, v]) => (
                            <Badge key={k} label={`${k}: ${v}`} tone="info" />
                          ))}
                        </div>
                        {ev.notes ? <p className="mt-2 text-sm text-muted-foreground">{ev.notes}</p> : null}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          ) : (
            <EmptyState title={t('noEvaluations')} />
          )}
        </TabsContent>

        <TabsContent value="docs">
          <div className="card p-0">
            <DataTable columns={docColumns} rows={documents} getRowId={(d) => d.id} emptyTitle={t('noDocuments')} />
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          {timeline.length === 0 ? (
            <EmptyState title={t('noTimeline')} />
          ) : (
            <ol className="relative space-y-3 border-s-2 border-border ps-4">
              {timeline.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
                  <p className="text-sm font-medium">{ev.action}</p>
                  <p className="text-xs text-muted-foreground">{fmt.dateTime(ev.createdAt)}</p>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>

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
