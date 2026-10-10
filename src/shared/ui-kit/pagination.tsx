'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { Select } from './select';
import { cn } from './utils';

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: PaginationProps) {
  const t = useTranslations('ui.table');
  const tc = useTranslations('common');

  if (total === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-border px-1 py-3 text-sm',
        className
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {onPageSizeChange ? (
          <>
            <label className="whitespace-nowrap">{t('rowsPerPage')}</label>
            <div className="w-20">
              <Select
                aria-label={t('rowsPerPage')}
                value={String(pageSize)}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
                className="h-9"
              />
            </div>
          </>
        ) : null}
        <span aria-live="polite">
          {tc('showing', {
            from: (page - 1) * pageSize + 1,
            to: Math.min(page * pageSize, total),
            total,
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={tc('previous')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <span className="tabular-nums text-muted-foreground">
          {tc('page')} {page} {tc('of')} {Math.max(totalPages, 1)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={tc('next')}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
