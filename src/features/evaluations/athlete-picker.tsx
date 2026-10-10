'use client';

/**
 * AthletePicker — بحث رياضي عبر GET /athletes (حقل q) ثم اختيار واحد.
 * يُستخدم في فلاتر التقييمات/الوثائق ونوافذ الإنشاء. لا بيانات وهمية:
 * النتائج فقط من الخادم، والعرض محكوم بنطاق البيانات في الخادم.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Search, X } from 'lucide-react';
import type { AthleteDto } from '@/shared/api/types';
import { useApi } from '@/shared/hooks/useApi';
import { useErrorText, useDebouncedValue } from '@/shared/hooks/useApi';
import { cn } from '@/shared/ui-kit/utils';

export interface AthleteSelection {
  id: string;
  name: string;
  registrationNo: string;
}

export interface AthletePickerProps {
  value: AthleteSelection | null;
  onChange: (next: AthleteSelection | null) => void;
  label?: string;
  /** تعطيل الجلب (مثل غياب صلاحية athletes.view). */
  enabled?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
}

function fullName(a: AthleteDto): string {
  return `${a.firstName} ${a.lastName}`.trim();
}

export function AthletePicker({
  value,
  onChange,
  label,
  enabled = true,
  invalid = false,
  disabled = false,
  id,
}: AthletePickerProps) {
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const listboxId = `${useId()}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounced = useDebouncedValue(term, 350);

  const canSearch = enabled && debounced.trim().length >= 2;
  const results = useApi<AthleteDto[]>('/athletes', {
    params: { q: debounced.trim(), pageSize: 20, sort: 'firstName' },
    enabled: canSearch,
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const items = results.data ?? [];

  return (
    <div className="space-y-1.5" ref={wrapRef}>
      {label ? (
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
      ) : null}

      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <span className="min-w-0 truncate text-sm">
            {value.name}
            <span className="ms-2 ltr-field font-mono text-xs text-muted-foreground">{value.registrationNo}</span>
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setTerm('');
              setOpen(false);
            }}
            className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={tc('clear')}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id={id}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            autoComplete="off"
            disabled={disabled}
            value={term}
            placeholder={tc('searchPlaceholder')}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className={cn(
              'input-base ps-9',
              invalid && 'border-destructive focus-visible:ring-destructive',
            )}
          />
        </div>
      )}

      {!value && open && canSearch ? (
        <div id={listboxId} className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-md">
          {results.loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {tc('loading')}
            </div>
          ) : results.error ? (
            <p className="px-3 py-2 text-sm text-destructive">{errorText(results.error)}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">{tc('noData')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      onChange({ id: a.id, name: fullName(a), registrationNo: a.registrationNo });
                      setOpen(false);
                      setTerm('');
                    }}
                  >
                    <span className="min-w-0 truncate">{fullName(a)}</span>
                    <span className="ltr-field shrink-0 font-mono text-xs text-muted-foreground">
                      {a.registrationNo}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
