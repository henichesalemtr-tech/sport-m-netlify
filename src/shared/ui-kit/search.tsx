'use client';

import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from './utils';
import { useDebouncedValue } from '@/shared/hooks/useApi';

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onSearch: (value: string) => void;
  /** تأخير النبض بالمللي ثانية. */
  debounceMs?: number;
}

/** حقل بحث مع debounce وزر مسح — يُعلن التغيير بعد توقف الكتابة. */
export function SearchInput({ value, onSearch, debounceMs = 350, className, ...props }: SearchInputProps) {
  const t = useTranslations('common');
  const [local, setLocal] = useState(value);
  const debounced = useDebouncedValue(local, debounceMs);

  useEffect(() => setLocal(value), [value]);

  useEffect(() => {
    if (debounced !== value) onSearch(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className={cn('relative w-full sm:max-w-xs', className)}>
      <SearchIcon
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        role="searchbox"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={props.placeholder ?? t('searchPlaceholder')}
        aria-label={props['aria-label'] ?? t('search')}
        className="input-base ps-9 pe-9"
        {...props}
      />
      {local.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setLocal('');
            onSearch('');
          }}
          aria-label={t('clear')}
          className="absolute end-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
