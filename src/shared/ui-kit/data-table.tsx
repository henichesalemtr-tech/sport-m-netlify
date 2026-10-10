'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { TableSkeleton } from './skeleton';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { cn } from './utils';

export interface DataTableColumn<T> {
  /** Server-sort field name (matches API `sort` query). Omit for non-sortable. */
  key?: string;
  header: string;
  cell: (row: T) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  /** Show this column in the default mobile card layout. */
  showInCard?: boolean;
  align?: 'start' | 'end' | 'center';
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  /** Current server sort string, e.g. `name,-createdAt`. */
  sort?: string;
  onSortChange?: (sort: string) => void;
  onRowClick?: (row: T) => void;
  /** Optional custom mobile card renderer; defaults to columns with showInCard. */
  renderCard?: (row: T) => ReactNode;
  className?: string;
}

function nextSort(current: string | undefined, field: string): string {
  const parts = (current ?? '').split(',').filter(Boolean);
  const idx = parts.findIndex((p) => p === field || p === `-${field}`);
  if (idx === -1) return field;
  if (parts[idx] === field) return `-${field}`;
  // descending -> remove (unsorted)
  parts.splice(idx, 1);
  return parts.join(',');
}

function sortDirection(sort: string | undefined, field: string): 'asc' | 'desc' | null {
  if (!sort) return null;
  if (sort.split(',').includes(field)) return 'asc';
  if (sort.split(',').includes(`-${field}`)) return 'desc';
  return null;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading = false,
  error = null,
  onRetry,
  emptyTitle,
  emptyHint,
  emptyAction,
  sort,
  onSortChange,
  onRowClick,
  renderCard,
  className,
}: DataTableProps<T>) {
  const t = useTranslations('ui.table');

  const columnDefs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col, i) => ({
        id: col.key ?? `col-${i}`,
        header: col.header,
        cell: ({ row }) => col.cell(row.original),
      })),
    [columns]
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  if (loading) return <TableSkeleton rows={6} cols={columns.length} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? t('noResults')}
        hint={emptyHint}
        action={emptyAction}
      />
    );
  }

  const cardColumns = columns.filter((c) => c.showInCard !== false);

  return (
    <div className={className}>
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-muted/50">
                {hg.headers.map((header, i) => {
                  const col = columns[i];
                  const sortable = Boolean(col?.key && onSortChange);
                  const dir = col?.key ? sortDirection(sort, col.key) : null;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn(
                        'px-3 py-2.5 text-start font-semibold text-muted-foreground whitespace-nowrap',
                        col?.align === 'end' && 'text-end',
                        col?.align === 'center' && 'text-center',
                        col?.headerClassName
                      )}
                      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                    >
                      {sortable && col?.key ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          onClick={() => onSortChange?.(nextSort(sort, col.key!))}
                          title={dir === 'asc' ? t('sortDesc') : t('sortAsc')}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === 'asc' ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : dir === 'desc' ? (
                            <ArrowDown className="size-3.5" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                data-row-id={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  'border-b border-border last:border-0 bg-card',
                  onRowClick && 'cursor-pointer hover:bg-muted/50 transition-colors'
                )}
              >
                {row.getVisibleCells().map((cell, i) => {
                  const col = columns[i];
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-3 py-2.5 align-middle',
                        col?.align === 'end' && 'text-end',
                        col?.align === 'center' && 'text-center',
                        col?.cellClassName
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((row) =>
          renderCard ? (
            <div key={getRowId(row)}>{renderCard(row)}</div>
          ) : (
            <div
              key={getRowId(row)}
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className="card space-y-1.5 p-3"
            >
              {cardColumns.map((col, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">{col.header}</span>
                  <span className={cn('min-w-0 text-end', col.align === 'end' && 'tabular-nums')}>
                    {col.cell(row)}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
