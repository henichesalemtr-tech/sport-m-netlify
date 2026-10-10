'use client';

import { useTranslations } from 'next-intl';
import { FileUp, UploadCloud, X } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { formatBytes } from '@/shared/lib/format';
import { cn } from './utils';

export interface FileUploadProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  maxSizeMb?: number;
  label?: string;
  error?: string | null;
  disabled?: boolean;
  uploading?: boolean;
  className?: string;
}

/** ملف رفع واحد مع سحب/إفلات وتحقق من الحجم والنوع. */
export function FileUpload({
  file,
  onFileChange,
  accept,
  maxSizeMb = 10,
  label,
  error,
  disabled = false,
  uploading = false,
  className,
}: FileUploadProps) {
  const t = useTranslations('ui.file');
  const tc = useTranslations('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const id = useId();

  const validate = useCallback(
    (f: File): string | null => {
      if (f.size > maxSizeMb * 1024 * 1024) {
        setLocalError(`${f.name} — ${formatBytes(f.size)} > ${maxSizeMb}MB`);
        return 'too-large';
      }
      setLocalError(null);
      return null;
    },
    [maxSizeMb]
  );

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f) return;
    if (validate(f)) {
      onFileChange(null);
      return;
    }
    onFileChange(f);
  };

  const shownError = error ?? localError;

  return (
    <div className={cn('space-y-1', className)}>
      {label ? (
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
      ) : null}
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <FileUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatBytes(file.size)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onFileChange(null);
              setLocalError(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            disabled={disabled || uploading}
            className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('remove')}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || uploading}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled && !uploading) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!disabled && !uploading) handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            'flex min-h-touch cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:border-primary/50',
            (disabled || uploading) && 'cursor-not-allowed opacity-60'
          )}
        >
          <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-sm text-muted-foreground">
            {uploading ? tc('uploading') : t('dragDrop')}
          </span>
          <span className="text-xs text-muted-foreground/70">
            {accept ? accept.replace(/\./g, '').toUpperCase() : ''} · {maxSizeMb}MB max
          </span>
        </div>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(e) => handleFiles(e.target.files)}
        aria-invalid={Boolean(shownError)}
      />
      {shownError ? (
        <p role="alert" className="text-xs text-destructive">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}
