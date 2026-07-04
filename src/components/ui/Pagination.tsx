import React from 'react';

import { paginationRange } from './pagination-model';

interface PaginationProps {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  className?: string;
}

const linkCls =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 font-mono text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50';

export function Pagination({ page, pageCount, hrefFor, className = '' }: PaginationProps) {
  if (pageCount <= 1) return null;
  const items = paginationRange(page, pageCount);
  return (
    <nav aria-label="Paginação" data-testid="pagination" className={className}>
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <a href={hrefFor(page - 1)} aria-label="Página anterior" className={linkCls}>
              ←
            </a>
          ) : (
            <span className="inline-flex h-8 items-center px-2 text-sm text-white/20">←</span>
          )}
        </li>
        {items.map((item, i) => (
          <li key={`${item}-${i}`}>
            {item === 'gap' ? (
              <span className="inline-flex h-8 items-center px-1.5 text-sm text-dim">…</span>
            ) : item === page ? (
              <span
                aria-current="page"
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-brand-glow px-2 font-mono text-sm text-brand"
              >
                {item}
              </span>
            ) : (
              <a href={hrefFor(item)} className={linkCls}>
                {item}
              </a>
            )}
          </li>
        ))}
        <li>
          {page < pageCount ? (
            <a href={hrefFor(page + 1)} aria-label="Próxima página" className={linkCls}>
              →
            </a>
          ) : (
            <span className="inline-flex h-8 items-center px-2 text-sm text-white/20">→</span>
          )}
        </li>
      </ul>
    </nav>
  );
}
