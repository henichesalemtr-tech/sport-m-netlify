'use client';

import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from './skeleton';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { cn } from './utils';

export type ChartKind = 'line' | 'bar' | 'pie';

export interface ChartDatum {
  name: string;
  value: number;
  value2?: number;
}

export interface ChartProps {
  kind: ChartKind;
  data: ChartDatum[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  height?: number;
  /** Label of the primary series (legend/tooltip). */
  seriesLabel?: string;
  series2Label?: string;
  valueFormatter?: (value: number) => string;
  className?: string;
}

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent, var(--primary)) / 0.6)',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--success))',
  'hsl(var(--muted-foreground))',
];

/** Recharts wrapper with Loading/Empty/Error states and an accessible text alternative. */
export function Chart({
  kind,
  data,
  loading = false,
  error = null,
  onRetry,
  height = 260,
  seriesLabel,
  series2Label,
  valueFormatter,
  className,
}: ChartProps) {
  const t = useTranslations('ui.chart');

  if (loading)
    return (
      <div className={cn('w-full', className)}>
        <Skeleton className="w-full rounded-lg" style={{ height }} />
        <div className="sr-only" role="status">{t('textAlternative')}</div>
      </div>
    );
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data || data.length === 0) return <EmptyState title={t('noChartData')} />;

  const fmt = (v: number) => (valueFormatter ? valueFormatter(v) : String(v));
  const hasSeries2 = data.some((d) => d.value2 !== undefined);

  const axisProps = {
    stroke: 'hsl(var(--muted-foreground))',
    fontSize: 11,
    tickLine: false as const,
  };

  let chart: React.ReactNode;
  if (kind === 'pie') {
    chart = (
      <PieChart>
        <Tooltip formatter={(v) => fmt(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    );
  } else if (kind === 'bar') {
    chart = (
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis {...axisProps} width={40} />
        <Tooltip formatter={(v) => fmt(Number(v))} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
        {hasSeries2 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        <Bar dataKey="value" name={seriesLabel ?? 'value'} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={42} />
        {hasSeries2 ? (
          <Bar
            dataKey="value2"
            name={series2Label ?? 'value2'}
            fill="hsl(var(--warning))"
            radius={[4, 4, 0, 0]}
            maxBarSize={42}
          />
        ) : null}
      </BarChart>
    );
  } else {
    chart = (
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis {...axisProps} width={40} />
        <Tooltip formatter={(v) => fmt(Number(v))} />
        {hasSeries2 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        <Line
          type="monotone"
          dataKey="value"
          name={seriesLabel ?? 'value'}
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        {hasSeries2 ? (
          <Line
            type="monotone"
            dataKey="value2"
            name={series2Label ?? 'value2'}
            stroke="hsl(var(--warning))"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ) : null}
      </LineChart>
    );
  }

  return (
    <div className={cn('w-full', className)} role="img" aria-label={seriesLabel ?? t('textAlternative')}>
      <ResponsiveContainer width="100%" height={height}>
        {chart}
      </ResponsiveContainer>
      {/* Accessible text alternative */}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          {t('textAlternative')}
        </summary>
        <table className="mt-2 w-full print-table">
          <thead>
            <tr className="border-b border-border text-start">
              <th scope="col" className="px-2 py-1 text-start font-medium">{t('legend')}</th>
              <th scope="col" className="px-2 py-1 text-end font-medium">{seriesLabel ?? 'value'}</th>
              {hasSeries2 ? (
                <th scope="col" className="px-2 py-1 text-end font-medium">{series2Label ?? 'value2'}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.name} className="border-b border-border last:border-0">
                <td className="px-2 py-1">{d.name}</td>
                <td className="px-2 py-1 text-end tabular-nums">{fmt(d.value)}</td>
                {hasSeries2 ? (
                  <td className="px-2 py-1 text-end tabular-nums">{fmt(d.value2 ?? 0)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
