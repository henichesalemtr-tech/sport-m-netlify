'use client';

import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Banknote,
  CalendarCheck,
  CreditCard,
  Layers,
  TrendingDown,
  TrendingUp,
  Users,
  GraduationCap,
  Trophy,
} from 'lucide-react';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { StatsCard } from '@/shared/ui-kit/stats-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui-kit/card';
import { Chart } from '@/shared/ui-kit/chart';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { TableSkeleton } from '@/shared/ui-kit/skeleton';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import type { DashboardAttendance, DashboardCharts, GeneralDashboard } from '@/shared/api/types';

export function DashboardScreen() {
  const t = useTranslations('dashboard');
  const errorText = useErrorText();
  const fmt = useFormatters();
  const { can } = useSession();

  const general = useApi<GeneralDashboard>('/dashboard');
  const attendance = useApi<DashboardAttendance>('/dashboard/attendance');
  const charts = useApi<DashboardCharts>(can('reports.view') ? '/dashboard/charts' : null);

  if (general.error) {
    return <ErrorState message={errorText(general.error)} onRetry={general.reload} />;
  }

  const g = general.data;
  const a = attendance.data;
  const c = charts.data;
  const finance = g?.finance ?? null;

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {/* مؤشرات الأشخاص والاشتراكات */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title={t('athletesTotal')}
          value={g ? fmt.number(g.athletes.total) : ''}
          icon={Users}
          hint={g ? `${t('athletesActive')}: ${fmt.number(g.athletes.active)}` : undefined}
          loading={general.loading}
        />
        <StatsCard
          title={t('groupsCount')}
          value={g ? fmt.number(g.groups) : ''}
          icon={Layers}
          loading={general.loading}
        />
        <StatsCard
          title={t('coachesCount')}
          value={g && g.coaches !== null ? fmt.number(g.coaches) : '—'}
          icon={GraduationCap}
          loading={general.loading}
        />
        <StatsCard
          title={t('sportsCount')}
          value={g && g.sports !== null ? fmt.number(g.sports) : '—'}
          icon={Trophy}
          loading={general.loading}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatsCard
          title={t('subsActive')}
          value={g ? fmt.number(g.subscriptions.active) : ''}
          icon={CreditCard}
          tone="success"
          loading={general.loading}
        />
        <StatsCard
          title={t('subsExpiring')}
          value={g ? fmt.number(g.subscriptions.expiring) : ''}
          icon={AlertTriangle}
          tone="warning"
          loading={general.loading}
        />
        <StatsCard
          title={t('subsExpired')}
          value={g ? fmt.number(g.subscriptions.expired) : ''}
          icon={TrendingDown}
          tone="destructive"
          loading={general.loading}
        />
      </div>

      {/* المالية — بوابة بالصلاحية */}
      {finance ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard title={t('collected')} value={fmt.moneyDecimal(finance.collected)} icon={Banknote} tone="success" />
          <StatsCard title={t('due')} value={fmt.moneyDecimal(finance.due)} icon={CreditCard} tone="warning" />
          <StatsCard title={t('debtors')} value={fmt.number(finance.debtors)} icon={Users} tone="destructive" />
          <StatsCard
            title={t('netRevenue')}
            value={fmt.moneyDecimal(finance.netRevenue)}
            icon={TrendingUp}
            hint={finance.expenses !== null ? `${t('expenses')}: ${fmt.moneyDecimal(finance.expenses)}` : undefined}
            tone={(finance.netRevenue ?? 0) >= 0 ? 'accent' : 'destructive'}
          />
        </div>
      ) : (
        can('reports.view_finance') === false && g ? (
          <p className="mt-3 text-xs text-muted-foreground">{t('noFinancePermission')}</p>
        ) : null
      )}

      {/* الحضور اليوم */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title={t('attendanceToday')}
          value={a ? `${fmt.number(a.counts.present)} / ${fmt.number(a.counts.total)}` : ''}
          icon={CalendarCheck}
          loading={attendance.loading}
          hint={a ? `${t('absences')}: ${fmt.number(a.counts.absent)}` : undefined}
        />
        <StatsCard
          title={t('attendanceRate')}
          value={a && a.rate !== null ? fmt.percent(a.rate) : '—'}
          icon={TrendingUp}
          tone={a && a.rate !== null && a.rate >= 75 ? 'success' : 'warning'}
          loading={attendance.loading}
        />
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">{t('highAbsenceGroups')}</CardTitle>
          </CardHeader>
          <CardContent>
            {attendance.loading ? (
              <TableSkeleton rows={2} cols={2} />
            ) : !a || a.highAbsenceGroups.length === 0 ? (
              <EmptyState title={t('highAbsenceGroups')} className="min-h-16 p-2" />
            ) : (
              <ul className="space-y-1 text-sm">
                {a.highAbsenceGroups.slice(0, 4).map((grp) => (
                  <li key={grp.groupId} className="flex items-center justify-between gap-2">
                    <span className="truncate">{grp.name}</span>
                    <StatusBadge value="ABSENT" label={`${t('absences')}: ${fmt.number(grp.absences)}`} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* الرسوم البيانية */}
      {can('reports.view') ? (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('revenueVsExpenses')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Chart
                kind="line"
                loading={charts.loading}
                error={charts.error ? errorText(charts.error) : null}
                onRetry={charts.reload}
                seriesLabel={t('revenue')}
                series2Label={t('expenses')}
                valueFormatter={fmt.moneyDecimal}
                data={(c?.revenueVsExpenses ?? []).map((m) => ({
                  name: m.key,
                  value: m.revenue,
                  value2: m.expenses,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('attendanceTrend')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Chart
                kind="line"
                loading={charts.loading}
                seriesLabel={t('attendanceRate')}
                valueFormatter={fmt.percent}
                data={(c?.attendanceTrend ?? []).map((d) => ({
                  name: fmt.date(d.date),
                  value: d.rate ?? 0,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('athletesBySport')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Chart
                kind="bar"
                loading={charts.loading}
                seriesLabel={t('athletesTotal')}
                valueFormatter={fmt.number}
                data={(c?.athletesBySport ?? []).map((s) => ({ name: s.sport, value: s.athletes }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('subscriptionsByStatus')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Chart
                kind="pie"
                loading={charts.loading}
                valueFormatter={fmt.number}
                data={(c?.subscriptionsByStatus ?? []).map((s) => ({
                  name: s.status,
                  value: s.count,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* آخر سجلات الحضور */}
      <Card className="mt-3">
        <CardHeader>
          <CardTitle className="text-sm">{t('lastRecords')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {attendance.loading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : !a || a.lastRecords.length === 0 ? (
            <EmptyState className="min-h-24" />
          ) : (
            <ul className="divide-y divide-border">
              {a.lastRecords.slice(0, 6).map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {r.athleteName}
                    <span className="ms-2 text-xs text-muted-foreground">{r.sessionTitle}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:block">{fmt.date(r.recordDate)}</span>
                    <StatusBadge value={r.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {g ? <p className="mt-3 text-xs text-muted-foreground">{t('asOf', { time: fmt.dateTime(g.asOf) })}</p> : null}
    </div>
  );
}
