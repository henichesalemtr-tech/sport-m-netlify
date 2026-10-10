'use client';

import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from './utils';
import { Skeleton } from './skeleton';

export interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  /** نص مساعد صغير أسفل القيمة. */
  hint?: string;
  /** اتجاه التغير (اختياري) — + ارتفاع، - انخفاض. */
  trend?: { direction: 'up' | 'down'; label: string };
  tone?: 'default' | 'success' | 'warning' | 'destructive' | 'accent';
  loading?: boolean;
  className?: string;
}

const toneClasses: Record<NonNullable<StatsCardProps['tone']>, string> = {
  default: 'text-primary bg-primary/10',
  success: 'text-success bg-success/10',
  warning: 'text-warning bg-warning/10',
  destructive: 'text-destructive bg-destructive/10',
  accent: 'text-accent bg-accent/10',
};

/** بطاقة مؤشر للوحات القيادة — لا تعتمد على اللون وحده (أيقونة + نص). */
export function StatsCard({ title, value, icon: Icon, hint, trend, tone = 'default', loading, className }: StatsCardProps) {
  if (loading) {
    return (
      <div className={cn('card p-4', className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-8 w-32" />
      </div>
    );
  }
  return (
    <div className={cn('card flex items-start justify-between gap-3 p-4', className)}>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
        <p className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
        {trend ? (
          <p className={cn('mt-1 inline-flex items-center gap-1 text-xs font-medium', trend.direction === 'up' ? 'text-success' : 'text-destructive')}>
            {trend.direction === 'up' ? <TrendingUp className="size-3.5" aria-hidden="true" /> : <TrendingDown className="size-3.5" aria-hidden="true" />}
            {trend.label}
          </p>
        ) : null}
      </div>
      {Icon ? (
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', toneClasses[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
}
