'use client';

import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ reset }: ErrorProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-base p-8 text-center">
      <Logo withMark size="md" />
      <div className="max-w-sm space-y-2">
        <h1 className="font-heading text-xl font-semibold text-white">Algo deu errado.</h1>
        <p className="text-sm text-muted">
          Ocorreu um erro inesperado. Por favor, tente novamente.
        </p>
      </div>
      <Button variant="primary" onClick={reset}>
        Tentar novamente
      </Button>
    </main>
  );
}
