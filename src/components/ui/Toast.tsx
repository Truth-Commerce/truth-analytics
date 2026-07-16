'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { DUR, EASE_TRUTH } from '@/lib/motion';

import {
  addToast,
  duracaoDoToast,
  removeToast,
  type ToastInput,
  type ToastItem,
  type ToastVariant,
} from './toast-store';

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
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setItems((list) => removeToast(list, id));
  }, []);

  const agendar = useCallback(
    (id: number, variant: ToastVariant) => {
      const dur = duracaoDoToast(variant);
      if (dur === null) return; // erro é persistente
      const timer = setTimeout(() => dismiss(id), dur);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const pausar = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = idRef.current++;
      setItems((list) => addToast(list, input, id));
      agendar(id, input.variant ?? 'info');
      // Toasts empurrados p/ fora pelo cap MAX_TOASTS: o timer órfão só chama
      // removeToast de um id ausente (no-op) — sem vazamento de estado.
    },
    [agendar],
  );

  // Unmount do provider: nenhum timer sobrevive.
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
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
              role={t.variant === 'error' ? 'alert' : undefined}
              onMouseEnter={() => pausar(t.id)}
              onMouseLeave={() => agendar(t.id, t.variant)}
              onFocusCapture={() => pausar(t.id)}
              onBlurCapture={() => agendar(t.id, t.variant)}
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
                  {t.action ? (
                    <button
                      type="button"
                      onClick={() => {
                        t.action!.onClick();
                        dismiss(t.id);
                      }}
                      className="mt-2 inline-flex min-h-10 items-center rounded-lg px-2 py-1 text-sm font-medium text-brand outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-brand/60"
                    >
                      {t.action.label}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Fechar aviso"
                  onClick={() => dismiss(t.id)}
                  className="-my-2 -mr-2 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60"
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
