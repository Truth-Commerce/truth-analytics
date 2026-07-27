'use client';

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'framer-motion';

import { DUR, EASE_TRUTH } from '@/lib/motion';

import { FOCUSABLE_SELECTOR, proximoIndiceFoco } from './dialog-model';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  'aria-label'?: string;
  labelledBy?: string;
  position?: 'center' | 'top';
  maxWidthClassName?: string;
  children: React.ReactNode;
  'data-testid'?: string;
}

function subscribeToClient() {
  return () => {};
}

/**
 * Primitivo modal único da casa: portal no body, focus-trap com loop de Tab,
 * inert/aria-hidden no #app-content, scroll-lock do body, Escape, restauração
 * de foco ao trigger e AnimatePresence com EASE_TRUTH. ConfirmDialog e o ⌘K
 * são construídos sobre ele.
 */
export function Dialog({
  open,
  onClose,
  'aria-label': ariaLabel,
  labelledBy,
  position = 'center',
  maxWidthClassName = 'max-w-sm',
  children,
  'data-testid': testid,
}: DialogProps) {
  const mounted = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Scroll-lock + inert no fundo + foco inicial + restauração ao fechar.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const app = document.getElementById('app-content');
    app?.setAttribute('inert', '');
    app?.setAttribute('aria-hidden', 'true');

    // Foco inicial: [data-autofocus] > 1º focável > painel.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const auto = panel.querySelector<HTMLElement>('[data-autofocus]');
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (auto ?? first ?? panel).focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      app?.removeAttribute('inert');
      app?.removeAttribute('aria-hidden');
      triggerRef.current?.focus();
    };
  }, [open]);

  // Escape fecha; Tab fica preso ao painel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focaveis = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const atual = focaveis.indexOf(document.activeElement as HTMLElement);
      const proximo = proximoIndiceFoco(focaveis.length, atual, e.shiftKey);
      e.preventDefault();
      if (proximo >= 0) focaveis[proximo]!.focus();
      else panel.focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.fast }}
          data-testid={testid}
          onClick={onClose}
          className={`fixed inset-0 z-50 flex justify-center bg-black/60 p-4 backdrop-blur-sm ${
            position === 'top' ? 'items-start pt-[18vh]' : 'items-center'
          }`}
        >
          <m.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: DUR.fast, ease: EASE_TRUTH }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full outline-none ${maxWidthClassName}`}
          >
            {children}
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
