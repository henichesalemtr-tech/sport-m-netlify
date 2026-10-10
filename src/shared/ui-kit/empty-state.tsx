'use client';

import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from './utils';

export interface EmptyStateProps {
  title?: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** حالة "لا بيانات" موحّدة (كل شاشة يجب أن تعرضها). */
export function EmptyState({ title, hint, icon, action, className }: EmptyStateProps) {
  const t = useTranslations('ui.state');
  return (
    <div className={cn('flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="size-6" aria-hidden="true" />}
      </span>
      <p className="text-sm font-medium">{title ?? t('empty')}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
