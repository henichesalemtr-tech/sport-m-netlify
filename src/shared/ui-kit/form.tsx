'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from './utils';

export interface FieldProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
  /** يملأ الحقل عرض الشبكة بالكامل (col-span كامل داخل FormGrid). */
  full?: boolean;
}

/** غلاف حقل نموذج: تسمية + عنصر تحكم + رسالة خطأ (متوافق مع react-hook-form). */
export function Field({ label, htmlFor, required, optional, hint, error, children, className, full }: FieldProps) {
  const t = useTranslations('common');
  return (
    <div className={cn('space-y-1.5', full && 'sm:col-span-2', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
          {label}
          {required ? <span className="ms-1 text-destructive" aria-hidden>*</span> : null}
          {optional ? (
            <span className="ms-2 text-xs font-normal text-muted-foreground">({t('optional')})</span>
          ) : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <ErrorText message={error} /> : null}
    </div>
  );
}

export function ErrorText({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

/** تخطيط نموذج: عمود واحد على الموبايل، عمودان على الشاشات الكبيرة. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

/** شريط أزرار الحفظ/الإلغاء المثبّت أسفل النماذج. */
export function FormActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6',
        className
      )}
    >
      {children}
    </div>
  );
}
