'use client';

import React, { useId } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

import { chartTheme } from './chart-theme';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
}

/** Mini-tendência sem eixos/tooltip — decorativa (aria-hidden). */
export function Sparkline({ data, width = 120, height = 36 }: SparklineProps) {
  const gradId = useId().replace(/:/g, '');
  const points = data.map((y, i) => ({ i, y }));
  return (
    <div aria-hidden="true" style={{ width, height }}>
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.areaFrom} />
              <stop offset="100%" stopColor={chartTheme.areaTo} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="y"
            stroke={chartTheme.brand}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
