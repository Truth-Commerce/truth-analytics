'use client';

import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { chartTheme, seriesColor } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';

interface StackedAreaChartProps {
  keys: string[];
  rows: Array<Record<string, number | string>>;
  height?: number;
  formatY?: (v: number) => string;
  srSummary: string;
  /** Cores posicionais por item; ausente = paleta padrão. */
  colors?: string[];
}

/** Área empilhada canal×dia com legenda e resumo acessível. */
export function StackedAreaChart({ keys, rows, height = 280, formatY, srSummary, colors }: StackedAreaChartProps) {
  const corDe = (i: number) => colors?.[i] ?? seriesColor(i);
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={chartTheme.grid} vertical={false} />
            <XAxis dataKey="x" stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} />
            <YAxis width={56} stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} tickFormatter={(v: number) => (formatY ? formatY(v) : String(v))} />
            <Tooltip cursor={{ stroke: chartTheme.brand, strokeOpacity: 0.3 }} content={<GlassTooltip formatValue={formatY} />} />
            {keys.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} stackId="canais" stroke={corDe(i)} fill={corDe(i)} fillOpacity={0.25} strokeWidth={1.5} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {keys.map((k, i) => (
          <li key={k} className="flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: corDe(i) }} />
            {k}
          </li>
        ))}
      </ul>
      <p className="sr-only">{srSummary}</p>
    </div>
  );
}
