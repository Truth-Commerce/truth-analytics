'use client';

import React, { useId } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { chartTheme } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';
import type { EvolucaoComparadaRow } from './chart-models';

interface EvolucaoComparadaChartProps {
  data: EvolucaoComparadaRow[];
  height?: number;
  formatY?: (v: number) => string;
  temAnterior: boolean;
  srSummary: string;
}

/** Evolução do período: área (atual) + média móvel 7d (tracejada) + sombra do período anterior. */
export function EvolucaoComparadaChart({ data, height = 280, formatY, temAnterior, srSummary }: EvolucaoComparadaChartProps) {
  const gradId = useId().replace(/:/g, '');
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartTheme.areaFrom} />
                <stop offset="100%" stopColor={chartTheme.areaTo} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chartTheme.grid} vertical={false} />
            <XAxis dataKey="x" stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} />
            <YAxis width={56} stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} tickFormatter={(v: number) => (formatY ? formatY(v) : String(v))} />
            <Tooltip cursor={{ stroke: chartTheme.brand, strokeOpacity: 0.3 }} content={<GlassTooltip formatValue={formatY} />} />
            {temAnterior ? (
              <Line dataKey="anterior" name="Período anterior" type="monotone" stroke="#94a3b8" strokeWidth={1.5} strokeOpacity={0.6} dot={false} connectNulls />
            ) : null}
            <Area dataKey="atual" name="Vendas" type="monotone" stroke={chartTheme.brand} strokeWidth={2} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 4, fill: chartTheme.brand, stroke: '#04150a' }} />
            <Line dataKey="media" name="Média móvel 7d" type="monotone" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: chartTheme.brand }} />Vendas</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: '#38bdf8' }} />Média móvel 7d</li>
        {temAnterior ? (
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: '#94a3b8' }} />Período anterior</li>
        ) : null}
      </ul>
      <p className="sr-only">{srSummary}</p>
    </div>
  );
}
