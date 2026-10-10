'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from './button';
import { cn } from './utils';

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** حالة خطأ موحّدة مع زر إعادة محاولة. */
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  const t = useTranslations('ui.state');
  return (
    <div
      className={cn('flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center', className)}
      role="alert"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-destructive">{message ?? t('error')}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      ) : null}
    </div>
  );
}
