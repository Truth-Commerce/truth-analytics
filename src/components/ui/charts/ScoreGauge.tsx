'use client';

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';

export function ScoreGauge({ score, size = 180 }: { score: number; size?: number }) {
  const cor = score >= 70 ? '#07dd2b' : score >= 40 ? '#eab308' : '#ef4444';
  return (
    <div className="relative" style={{ width: size, height: size }} data-testid="score-gauge">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="78%"
          outerRadius="100%"
          data={[{ value: score }]}
          startAngle={225}
          endAngle={-45}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar dataKey="value" angleAxisId={0} fill={cor} background={{ fill: '#ffffff0f' }} cornerRadius={8} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl font-bold text-white" style={{ textShadow: `0 0 24px ${cor}66` }}>
          {score}
        </span>
        <span className="text-xs text-muted">/ 100</span>
      </div>
    </div>
  );
}
