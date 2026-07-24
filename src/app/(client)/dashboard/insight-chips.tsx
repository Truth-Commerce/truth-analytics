import React from 'react';
import Link from 'next/link';

import type { ChipRelatorio } from '@/modules/reports/dashboard-model';

/** Atalhos estáticos p/ o último relatório (substitui o marquee — sem animação). */
export function InsightChips({ chips }: { chips: ChipRelatorio[] }) {
  if (chips.length === 0) return null;
  return (
    <nav
      aria-label="Atalhos do último relatório"
      data-testid="insight-chips"
      className="flex flex-wrap gap-2"
    >
      {chips.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-full border border-line bg-glass px-4 py-1.5 text-xs text-muted transition-colors hover:border-brand/40 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          {c.label} →
        </Link>
      ))}
    </nav>
  );
}
