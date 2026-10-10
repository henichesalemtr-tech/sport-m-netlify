import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** الحقول الرقمية/البريدية/الأكواد تبقى LTR (CONVENTIONS — RTL). */
  ltr?: boolean;
  invalid?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ltr, invalid, type, ...props }, ref) => {
  const isLtr =
    ltr ??
    (type === 'email' ||
      type === 'tel' ||
      type === 'number' ||
      type === 'date' ||
      type === 'time' ||
      type === 'datetime-local');
  return (
    <input
      ref={ref}
      type={type}
      dir={isLtr ? 'ltr' : undefined}
      aria-invalid={invalid || undefined}
      className={cn(
        'input-base',
        isLtr && 'ltr-field',
        invalid && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
