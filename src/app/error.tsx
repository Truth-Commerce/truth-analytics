'use client';

import { useEffect } from 'react';

import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Observabilidade: registra o erro no console (o digest correlaciona com os logs do servidor).
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-base p-8 text-center">
      <Logo withMark size="md" />
      <div className="max-w-sm space-y-2">
        <h1 className="font-heading text-xl font-semibold text-white">Algo deu errado.</h1>
        <p className="text-sm text-muted">
          Ocorreu um erro inesperado. Por favor, tente novamente.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-dim">Código: {error.digest}</p>
        )}
      </div>
      <Button variant="primary" onClick={reset}>
        Tentar novamente
      </Button>
    </main>
  );
}
