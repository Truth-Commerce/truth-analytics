import Link from 'next/link';
import React from 'react';

import { Logo } from '@/components/ui/Logo';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-bg-base text-white">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" aria-label="Truth Analytics — início">
            <Logo size="sm" />
          </Link>
          <Link href="/" className="text-sm text-muted transition-colors hover:text-white">
            ← Voltar ao início
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-10">{children}</div>
      <footer className="border-t border-line py-6 text-center text-xs text-dim">
        <p>&copy; {new Date().getFullYear()} Truth Commerce. Todos os direitos reservados.</p>
      </footer>
    </main>
  );
}
