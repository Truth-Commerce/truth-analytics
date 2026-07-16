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
 * eyebrow Space Mono uppercase verde + título Sora + radial-gradient sutil +
 * slots de ações (direita) e badges (abaixo do título). Server-safe.
 */
export function PageHeader({ eyebrow, title, description, actions, children, className = '' }: PageHeaderProps) {
  return (
    <header className={`relative overflow-hidden rounded-2xl border border-line bg-bg-surface p-6 md:p-8 ${className}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 90% at 20% 0%, rgba(7,221,43,0.08) 0%, transparent 60%)',
        }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-brand">{eyebrow}</p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-white md:text-3xl">{title}</h1>
          {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
          {children ? <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
