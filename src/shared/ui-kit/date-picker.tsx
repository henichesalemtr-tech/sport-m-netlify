'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from './utils';

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  invalid?: boolean;
}

/**
 * منتقي تاريخ — input[type=date] أصلي (لوحة مفاتيح نظام/جوال مدمجة، وصولية جيدة).
 * القيمة/التنسيق YYYY-MM-DD مطابقة لـ dateOnlySchema في الخادم.
 */
const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(({ className, invalid, ...props }, ref) => (
  <div className="relative w-full">
    <input
      ref={ref}
      type="date"
      dir="ltr"
      aria-invalid={invalid || undefined}
      className={cn(
        'input-base ltr-field pe-9',
        invalid && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
    <CalendarDays
      className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
  </div>
));
DatePicker.displayName = 'DatePicker';

export function TimePicker({ className, invalid, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalid?: boolean }) {
  return (
    <input
      type="time"
      dir="ltr"
      aria-invalid={invalid || undefined}
      className={cn('input-base ltr-field', invalid && 'border-destructive', className)}
      {...props}
    />
  );
}

export { DatePicker };

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, label, id, ...props }, ref) => (
  <label htmlFor={id} className={cn('inline-flex min-h-touch cursor-pointer items-center gap-2 text-sm', className)}>
    <input
      ref={ref}
      id={id}
      type="checkbox"
      className="size-5 shrink-0 rounded border-input accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      {...props}
    />
    {label ? <span>{label}</span> : null}
  </label>
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
