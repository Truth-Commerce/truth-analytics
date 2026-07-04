import React from 'react';

/** Marquee infinito de insights (lista duplicada + translateX(-50%)). */
export function InsightsMarquee({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  const loop = [...insights, ...insights];
  return (
    <div
      data-testid="insights-marquee"
      aria-label="Últimos insights da análise"
      className="relative overflow-hidden rounded-full border border-line bg-glass py-2"
    >
      <div className="flex w-max animate-marquee gap-8 pr-8 motion-reduce:animate-none">
        {loop.map((texto, i) => (
          <span
            key={i}
            aria-hidden={i >= insights.length}
            className="flex items-center gap-2 whitespace-nowrap text-xs text-muted"
          >
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-brand" />
            {texto}
          </span>
        ))}
      </div>
    </div>
  );
}
