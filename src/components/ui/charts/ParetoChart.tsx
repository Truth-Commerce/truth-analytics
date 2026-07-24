'use client';

import React from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { chartTheme } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';
import type { ParetoRow } from './chart-models';

interface ParetoChartProps {
  data: ParetoRow[];
  height?: number;
  formatReceita?: (v: number) => string;
  srSummary: string;
}

/** Pareto ABC: barras de receita + linha do % acumulado (eixo direito 0–100). */
export function ParetoChart({ data, height = 280, formatReceita, srSummary }: ParetoChartProps) {
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={chartTheme.grid} vertical={false} />
            <XAxis dataKey="label" stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 10, fontFamily: 'var(--font-mono)' }} tickLine={false} interval={0} angle={-30} textAnchor="end" height={54} />
            <YAxis yAxisId="receita" width={56} stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} tickFormatter={(v: number) => (formatReceita ? formatReceita(v) : String(v))} />
            <YAxis yAxisId="pct" orientation="right" width={40} domain={[0, 100]} stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              cursor={{ fill: 'rgba(20,18,15,0.04)' }}
              content={
                <GlassTooltip
                  formatValue={(v, name) =>
                    name === '% acumulado' ? `${v}%` : formatReceita ? formatReceita(v) : String(v)
                  }
                />
              }
            />
            <Bar yAxisId="receita" dataKey="receita" name="Receita" fill={chartTheme.brand} radius={[6, 6, 0, 0]} maxBarSize={32} />
            <Line yAxisId="pct" dataKey="acumulado" name="% acumulado" type="monotone" stroke="#b66a00" strokeWidth={2} dot={{ r: 2.5, fill: '#b66a00' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">{srSummary}</p>
    </div>
  );
}
