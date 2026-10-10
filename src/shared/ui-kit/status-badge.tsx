'use client';

import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  PauseCircle,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';

export type BadgeTone = 'success' | 'warning' | 'destructive' | 'muted' | 'accent' | 'info';

const toneClasses: Record<BadgeTone, string> = {
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
  muted: 'border-border bg-muted text-muted-foreground',
  accent: 'border-primary/40 bg-primary/10 text-primary',
  info: 'border-accent/40 bg-accent/40 text-foreground',
};

const STATUS_MAP: Record<string, { tone: BadgeTone; icon: LucideIcon }> = {
  ACTIVE: { tone: 'success', icon: CheckCircle2 },
  COMPLETED: { tone: 'success', icon: CheckCircle2 },
  PRESENT: { tone: 'success', icon: CheckCircle2 },
  PAID: { tone: 'success', icon: CheckCircle2 },
  AVAILABLE: { tone: 'success', icon: CheckCircle2 },
  INACTIVE: { tone: 'muted', icon: Circle },
  DISABLED: { tone: 'muted', icon: Ban },
  SUSPENDED: { tone: 'warning', icon: PauseCircle },
  LATE: { tone: 'warning', icon: Clock },
  EXPIRED: { tone: 'destructive', icon: AlertCircle },
  ABSENT: { tone: 'destructive', icon: XCircle },
  CANCELLED: { tone: 'muted', icon: XCircle },
  VOIDED: { tone: 'muted', icon: Ban },
  WITHDRAWN: { tone: 'muted', icon: Ban },
  BLOCKED: { tone: 'destructive', icon: Ban },
  EXCUSED: { tone: 'warning', icon: AlertCircle },
  RENEWING: { tone: 'accent', icon: CalendarClock },
  SCHEDULED: { tone: 'accent', icon: CalendarClock },
  MAINTENANCE: { tone: 'warning', icon: AlertCircle },
  CLOSED: { tone: 'muted', icon: Circle },
  PENDING: { tone: 'warning', icon: Clock },
  UNREAD: { tone: 'accent', icon: Circle },
  READ: { tone: 'muted', icon: CheckCircle2 },
};

export interface StatusBadgeProps {
  value: string;
  tone?: BadgeTone;
  icon?: LucideIcon;
  label?: string;
  className?: string;
}

/** Status badge: icon + translated text (never color alone). Unknown values fall back to the raw label with a neutral style. */
export function StatusBadge({ value, tone, icon, label, className }: StatusBadgeProps) {
  const t = useTranslations('status');
  const mapping = STATUS_MAP[value];
  const resolvedTone = tone ?? mapping?.tone ?? 'muted';
  const Icon = icon ?? mapping?.icon ?? Circle;
  let text = label;
  if (!text) {
    try {
      text = t(value);
    } catch {
      text = value;
    }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[resolvedTone],
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {text}
    </span>
  );
}

export interface SimpleBadgeProps {
  label: string;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ label, tone = 'muted', className }: SimpleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className
      )}
    >
      {label}
    </span>
  );
}
