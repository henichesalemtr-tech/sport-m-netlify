import type { ReactNode } from 'react';
import { cn } from './utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, backHref, backLabel, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {backHref ? (
          <a
            href={backHref}
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            {backLabel ?? '←'}
          </a>
        ) : null}
        <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
