import React from 'react';

interface TocProps {
  items: { href: string; label: string }[];
}

/** Sumário lateral fixo (desktop) — âncoras das seções do relatório. */
export function Toc({ items }: TocProps) {
  return (
    <nav
      aria-label="Sumário do relatório"
      className="sticky top-24 hidden h-fit w-44 flex-shrink-0 xl:block"
    >
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-dim">Neste relatório</p>
      <ul className="flex flex-col gap-1 border-l border-line">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="-ml-px block border-l border-transparent px-3 py-1 text-sm text-muted outline-none transition-colors hover:border-brand hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
