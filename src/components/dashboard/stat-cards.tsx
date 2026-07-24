'use client';

import React from 'react';
import { m } from 'framer-motion';

import { fadeLift, staggerContainer, useCountUp } from '@/lib/motion';
import { formatBRL } from '@/lib/format';
import { Sparkline } from '@/components/ui/charts/Sparkline';

export type StatItem = {
  label: string;
  value: number;
  format: 'brl' | 'int' | 'pct';
  spark?: number[];
};

function StatValue({ value, format }: { value: number; format: 'brl' | 'int' | 'pct' }) {
  const v = useCountUp(value);
  if (format === 'pct') {
    const positivo = value >= 0;
    return (
      <span
        className={`font-mono text-2xl font-bold ${positivo ? 'text-brand' : 'text-danger-fg'}`}
      >
        {positivo ? '▲ +' : '▼ '}
        {Math.abs(value).toFixed(1).replace('.', ',')}%
      </span>
    );
  }
  return (
    <span className="font-mono text-2xl font-bold text-ink">
      {format === 'brl' ? formatBRL(v) : String(Math.round(v))}
    </span>
  );
}

/** Linha de stats do bento: count-up em Space Mono + sparkline. */
export function StatCards({ items }: { items: StatItem[] }) {
  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {items.map((item) => (
        <m.div
          key={item.label}
          variants={fadeLift}
          className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-bg-surface p-5"
        >
          <span className="text-xs uppercase tracking-wide text-muted">{item.label}</span>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <StatValue value={item.value} format={item.format} />
            {item.spark && item.spark.length > 1 ? <Sparkline data={item.spark} /> : null}
          </div>
        </m.div>
      ))}
    </m.div>
  );
}
