'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';
import { Modal } from './modal';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  requireText?: string;
  requireTextValue?: string;
  textValue?: string;
  onTextValueChange?: (value: string) => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  loading = false,
  onConfirm,
  requireText,
  requireTextValue,
  textValue,
  onTextValueChange,
}: ConfirmDialogProps) {
  const tc = useTranslations('common');
  const needsTextMatch = Boolean(requireText && requireTextValue);
  const textOk = !needsTextMatch || textValue === requireTextValue;

  const confirmVariant = tone === 'danger' ? 'destructive' : tone === 'warning' ? 'warning' : 'primary';

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!loading) onOpenChange(o);
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel ?? tc('cancel')}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            loading={loading}
            disabled={needsTextMatch && !textOk}
          >
            {confirmLabel ?? tc('confirm')}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            tone === 'danger'
              ? 'text-destructive'
              : tone === 'warning'
                ? 'text-warning'
                : 'text-primary'
          }
          aria-hidden
        >
          <AlertTriangle className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-3 text-sm text-foreground">
          <div>{message}</div>
          {requireText ? (
            <div>
              <label htmlFor="confirm-text" className="mb-1 block text-muted-foreground">
                {requireText}
              </label>
              <input
                id="confirm-text"
                type="text"
                dir="ltr"
                autoComplete="off"
                className="input-base ltr-field w-full"
                value={textValue ?? ''}
                onChange={(e) => onTextValueChange?.(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
