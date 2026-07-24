'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/actions/notifications.actions';

interface NotificationItem {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string;
  href: string | null;
  lida: boolean;
  createdAt: string;
}

const POLL_INTERVAL_MS = 60_000;

/** Tempo relativo simples em pt-BR a partir de um ISO string (agora / Xmin / Xh / Xd). */
function tempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/**
 * Sino de notificações in-app. Faz polling leve de /api/notifications (mount +
 * 60s + volta de visibilidade da aba). Nunca lança: 401/erro de rede resultam
 * em estado vazio silencioso, para nunca quebrar o AppShell.
 *
 * Divergência documentada: usa popover próprio (useState + click-outside) em
 * vez do Dropdown de F1, porque o Dropdown gerencia o `open` internamente e
 * não expõe callback — aqui o contrato pede estado { unread, items, open }
 * controlado pelo próprio componente.
 */
export function NotificationBell({ verTodasHref }: { verTodasHref?: string } = {}) {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) {
        setUnread(0);
        setItems([]);
        return;
      }
      const data = (await res.json()) as { unread?: number; items?: NotificationItem[] };
      setUnread(typeof data.unread === 'number' ? data.unread : 0);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setUnread(0);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Foco: entra no popover ao abrir; volta ao sino ao fechar (a11y do "dialog" não-modal).
  const abertoAntes = useRef(false);
  useEffect(() => {
    if (open) {
      abertoAntes.current = true;
      const primeiro = popRef.current?.querySelector<HTMLElement>('button, a[href]');
      primeiro?.focus();
    } else if (abertoAntes.current) {
      abertoAntes.current = false;
      btnRef.current?.focus();
    }
  }, [open]);

  async function handleItemClick(item: NotificationItem) {
    const fd = new FormData();
    fd.set('notificationId', item.id);
    try {
      await markNotificationReadAction(fd);
    } finally {
      await fetchNotifications();
      setOpen(false);
      if (item.href) router.push(item.href);
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsReadAction();
    } finally {
      await fetchNotifications();
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        data-testid="notification-bell"
        aria-label="Notificações"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-ink-soft outline-none transition-colors hover:border-line hover:bg-paper-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unread > 0 && (
          <span
            data-testid="notification-unread"
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 font-mono text-[10px] font-semibold leading-4 text-white ring-2 ring-bg-base"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Notificações"
          className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-paper-1/95 p-1.5 shadow-paper backdrop-blur-md"
        >
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">Nenhuma notificação.</p>
            ) : (
              items.map((item) => (
                <form
                  key={item.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleItemClick(item);
                  }}
                >
                  <input type="hidden" name="notificationId" value={item.id} />
                  <button
                    type="submit"
                    className={`block w-full rounded-lg px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/50 ${
                      item.lida ? 'hover:bg-paper-2' : 'bg-brand-soft hover:bg-brand-soft'
                    }`}
                  >
                    <span className="block text-sm font-medium text-ink">{item.titulo}</span>
                    <span className="mt-0.5 block line-clamp-2 text-xs text-muted">{item.corpo}</span>
                    <span className="mt-1 block font-mono text-[10px] text-dim">
                      {tempoRelativo(item.createdAt)}
                    </span>
                  </button>
                </form>
              ))
            )}
          </div>
          <div className="mt-1 border-t border-line pt-1">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleMarkAllRead();
              }}
            >
              <button
                type="submit"
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink-soft outline-none transition-colors hover:bg-paper-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                Marcar todas como lidas
              </button>
            </form>
            {verTodasHref ? (
              <Link
                href={verTodasHref}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-brand-strong outline-none transition-colors hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                Ver todas
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
