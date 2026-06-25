import React from 'react';
import { signOutAction } from '@/actions/auth.actions';
import { Logo } from '@/components/ui/Logo';

interface AppShellProps {
  children: React.ReactNode;
  variant?: 'client' | 'admin';
}

export function AppShell({ children, variant = 'client' }: AppShellProps) {
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

          {/* Nav links */}
          <div className="flex items-center gap-1">
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

          {/* Sign out */}
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-full px-4 py-1.5 text-sm text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              Sair
            </button>
          </form>
        </nav>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
