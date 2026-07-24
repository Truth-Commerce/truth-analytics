import React from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Cabeçalho editorial das páginas (padrão extraído do hero do relatório):
 * eyebrow Inter uppercase verde + título Instrument Serif + wash verde sutil +
 * slots de ações (direita) e badges (abaixo do título). Server-safe.
 */
export function PageHeader({ eyebrow, title, description, actions, children, className = '' }: PageHeaderProps) {
  return (
    <header className={`relative overflow-hidden rounded-2xl border border-line bg-paper-1 p-6 shadow-paper md:p-8 ${className}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 100% at 10% 0%, rgba(19,122,62,0.10) 0%, transparent 62%)',
        }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-strong">{eyebrow}</p>
          <h1 className="mt-2 max-w-3xl text-balance font-heading text-3xl leading-tight text-ink md:text-4xl">{title}</h1>
          {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
          {children ? <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
