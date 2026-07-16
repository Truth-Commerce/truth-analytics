import Link from 'next/link';
import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-base px-4 py-8">
      {children}
      <p className="text-center text-xs text-dim">
        <Link href="/termos" className="transition-colors hover:text-muted hover:underline">
          Termos de Uso
        </Link>
        <span className="mx-2">·</span>
        <Link href="/privacidade" className="transition-colors hover:text-muted hover:underline">
          Política de Privacidade
        </Link>
      </p>
    </main>
  );
}
