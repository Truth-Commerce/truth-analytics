'use client';

import React, { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { chartTheme } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';

export type XY = { x: string; y: number };

interface LineChartProps {
  data: XY[];
  height?: number;
  formatY?: (v: number) => string;
}

/** Linha/área com gradiente verde neon → transparente (evolução temporal). */
export function LineChart({ data, height = 260, formatY }: LineChartProps) {
  const gradId = useId().replace(/:/g, '');
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.areaFrom} />
              <stop offset="100%" stopColor={chartTheme.areaTo} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="x"
            stroke={chartTheme.grid}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
          />
          <YAxis
            width={70}
            stroke={chartTheme.grid}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            tickFormatter={(v: number) => (formatY ? formatY(v) : String(v))}
          />
          <Tooltip
            cursor={{ stroke: chartTheme.brand, strokeOpacity: 0.3 }}
            content={<GlassTooltip formatValue={formatY} />}
          />
          <Area
            type="monotone"
            dataKey="y"
            stroke={chartTheme.brand}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4, fill: chartTheme.brand, stroke: '#04150a' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
