'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { DUR, EASE_TRUTH } from '@/lib/motion';

import {
  addToast,
  removeToast,
  type ToastInput,
  type ToastItem,
  type ToastVariant,
} from './toast-store';

const AUTO_DISMISS_MS = 5000;

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return ctx;
}

const variantClasses: Record<ToastVariant, string> = {
  success: 'border-success-border',
  error: 'border-danger-border',
  info: 'border-line',
};

const dotClasses: Record<ToastVariant, string> = {
  success: 'bg-success',
  error: 'bg-danger',
  info: 'bg-muted',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  const toast = useCallback((input: ToastInput) => {
    const id = idRef.current++;
    setItems((list) => addToast(list, input, id));
    setTimeout(() => setItems((list) => removeToast(list, id)), AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: DUR.fast, ease: EASE_TRUTH }}
              data-testid="toast"
              className={`pointer-events-auto rounded-2xl border bg-bg-surface/80 p-4 backdrop-blur-md ${variantClasses[t.variant]}`}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotClasses[t.variant]}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{t.title}</p>
                  {t.description ? (
                    <p className="mt-0.5 text-xs text-muted">{t.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Fechar aviso"
                  onClick={() => setItems((list) => removeToast(list, t.id))}
                  className="rounded p-0.5 text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
