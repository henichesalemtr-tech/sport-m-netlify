import { Loader2 } from 'lucide-react';
import { cn } from './utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-muted-foreground', className)} aria-hidden="true" />;
}

export function Loading({ label }: { label?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-muted-foreground" role="status" aria-live="polite">
      <Spinner className="size-7" />
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">…</span>}
    </div>
  );
}
