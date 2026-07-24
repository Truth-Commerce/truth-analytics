import Link from 'next/link';
import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-bg-base px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(19,122,62,0.12),transparent_48%)]"
      />
      <div className="relative flex w-full justify-center">{children}</div>
      <p className="relative text-center text-xs text-dim">
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
