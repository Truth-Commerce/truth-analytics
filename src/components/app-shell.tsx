'use client';

import React, { useState } from 'react';
import { signOutAction } from '@/actions/auth.actions';
import { Logo } from '@/components/ui/Logo';

interface AppShellProps {
  children: React.ReactNode;
  variant?: 'client' | 'admin';
}

export function AppShell({ children, variant = 'client' }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Top navigation */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg-surface/80 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          {/* Logo */}
          <a
            href="/dashboard"
            aria-label="Truth Analytics — ir ao dashboard"
            className="flex-shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <Logo size="sm" />
          </a>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-1 sm:flex">
            <a
              href="/dashboard"
              className="rounded-lg px-3 py-1.5 text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              Dashboard
            </a>
            <a
              href="/conexoes"
              className="rounded-lg px-3 py-1.5 text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              Conexões
            </a>
            {variant === 'admin' && (
              <a
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                Admin
              </a>
            )}
          </div>

          {/* Desktop sign out */}
          <form action={signOutAction} className="hidden sm:block">
            <button
              type="submit"
              className="rounded-full px-4 py-1.5 text-sm text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              Sair
            </button>
          </form>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex sm:hidden flex-col items-center justify-center gap-1.5 rounded-lg p-2 text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <span
              className={`block h-0.5 w-5 bg-current transition-transform duration-200 ${menuOpen ? 'translate-y-2 rotate-45' : ''}`}
            />
            <span
              className={`block h-0.5 w-5 bg-current transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`}
            />
            <span
              className={`block h-0.5 w-5 bg-current transition-transform duration-200 ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`}
            />
          </button>
        </nav>

        {/* Mobile menu drawer */}
        {menuOpen && (
          <div id="mobile-nav" className="border-t border-line bg-bg-surface/95 px-4 py-3 sm:hidden">
            <div className="flex flex-col gap-1">
              <a
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                Dashboard
              </a>
              <a
                href="/conexoes"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                Conexões
              </a>
              {variant === 'admin' && (
                <a
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  Admin
                </a>
              )}
              <div className="mt-1 border-t border-line pt-2">
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
                  >
                    Sair
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Page content — div (not main) so each page provides the single <main> landmark */}
      <div className="px-4 py-8">{children}</div>
    </div>
  );
}
