'use client';

import { useEffect } from 'react';

import './globals.css';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Fallback de último recurso: substitui ATÉ o root layout quando um erro ocorre
 * dentro dele. Precisa renderizar seu próprio <html>/<body> e não pode depender
 * das fontes/tokens do layout (usa estilos inline para garantir a marca).
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
          background: '#faf8f4',
          color: '#14120f',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
          <span style={{ color: '#137a3e' }}>Truth</span>Analytics
        </h1>
        <p style={{ color: '#4a443c', maxWidth: '24rem' }}>
          Ocorreu um erro inesperado. Por favor, tente novamente.
        </p>
        {error.digest && (
          <p style={{ color: '#888', fontFamily: 'monospace', fontSize: '0.75rem' }}>
            Código: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            background: '#137a3e',
            color: '#fff',
            border: 'none',
            borderRadius: '0.75rem',
            padding: '0.5rem 1.25rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
