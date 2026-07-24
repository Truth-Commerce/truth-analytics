'use client';

import React from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} labelledBy="confirm-dialog-title" maxWidthClassName="max-w-sm">
      <div className="rounded-2xl border border-line bg-paper-1 p-6 shadow-paper">
        <h2 id="confirm-dialog-title" className="font-heading text-xl text-ink">
          {title}
        </h2>
        {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          {/* ref/autofocus não passam pelo Button (props tipadas) — botão nativo estilizado */}
          <button
            type="button"
            data-autofocus
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium outline-none transition-all duration-150 ${
              variant === 'danger'
                ? 'border border-danger-border text-danger-fg hover:bg-danger-tint focus-visible:ring-2 focus-visible:ring-danger/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
                : 'bg-brand font-semibold text-white hover:bg-brand-strong hover:shadow-glow focus-visible:shadow-glow'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
