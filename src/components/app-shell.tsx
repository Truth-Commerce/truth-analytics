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
          <a href="/dashboard" className="flex-shrink-0">
            <Logo size="sm" />
          </a>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            <a
              href="/dashboard"
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-white/5 hover:text-white"
            >
              Dashboard
            </a>
            <a
              href="/conexoes"
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-white/5 hover:text-white"
            >
              Conexões
            </a>
            {variant === 'admin' && (
              <a
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-white/5 hover:text-white"
              >
                Admin
              </a>
            )}
          </div>

          {/* Sign out */}
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-full px-4 py-1.5 text-sm text-muted transition-colors hover:text-white"
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
