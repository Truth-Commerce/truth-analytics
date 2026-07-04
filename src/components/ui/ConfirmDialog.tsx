'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { DUR, EASE_TRUTH } from '@/lib/motion';

import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
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
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.fast }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: DUR.fast, ease: EASE_TRUTH }}
            className="w-full max-w-sm rounded-2xl border border-line bg-bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-dialog-title" className="font-heading text-base font-semibold text-white">
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
              {/* ref não passa pelo Button (props tipadas) — botão nativo estilizado */}
              <button
                ref={confirmRef}
                type="button"
                data-testid="confirm-dialog-confirm"
                onClick={onConfirm}
                className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium outline-none transition-all duration-150 ${
                  variant === 'danger'
                    ? 'border border-danger-border text-danger-fg hover:bg-danger-tint focus-visible:ring-1 focus-visible:ring-danger/50'
                    : 'bg-brand font-semibold text-[#04150a] hover:shadow-glow focus-visible:shadow-glow'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
