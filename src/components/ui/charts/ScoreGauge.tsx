'use client';

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';

import { useCountUp } from '@/lib/motion';

import { corDoScore } from './chart-theme';

export function ScoreGauge({ score, size = 180 }: { score: number; size?: number }) {
  const valor = Math.round(useCountUp(score, 1.1));
  const cor = corDoScore(score);
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      data-testid="score-gauge"
      role="img"
      aria-label={`Truth Score ${score} de 100`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="78%"
          outerRadius="100%"
          data={[{ value: valor }]}
          startAngle={225}
          endAngle={-45}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            dataKey="value"
            angleAxisId={0}
            fill={cor}
            background={{ fill: '#ffffff0f' }}
            cornerRadius={8}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="font-mono text-4xl font-bold text-white" style={{ textShadow: `0 0 24px ${cor}66` }}>
          {valor}
        </span>
        <span className="text-xs text-muted">/ 100</span>
      </div>
    </div>
  );
}
