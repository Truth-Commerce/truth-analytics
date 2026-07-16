import Link from 'next/link';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ScoreGauge } from '@/components/ui/charts/ScoreGauge';
import { Sparkline } from '@/components/ui/charts/Sparkline';
import type { ReportDetail } from '@/modules/reports/report.types';

export function TruthScoreCard({
  atual,
  anterior,
  serie = [],
  timelineTexto = null,
}: {
  atual: ReportDetail | null;
  anterior: ReportDetail | null;
  serie?: number[];
  timelineTexto?: string | null;
}) {
  const score = atual?.metricas?.truth_score;
  if (!score) return null; // relatório antigo sem score, ou nenhum done ainda
  const scoreAnterior = anterior?.metricas?.truth_score?.score ?? null;
  const delta = scoreAnterior === null ? null : score.score - scoreAnterior;
  return (
    <Card data-testid="truth-score-card">
      <CardHeader>
        <CardTitle as="h2" className="text-base">Truth Score</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-6">
        <ScoreGauge score={score.score} />
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted">Saúde da operação no último relatório.</p>
          {delta !== null && (
            <p className={`text-sm font-medium ${delta >= 0 ? 'text-brand' : 'text-danger-fg'}`} data-testid="score-delta">
              {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{delta} vs relatório anterior
            </p>
          )}
          {serie.length >= 2 ? (
            <div data-testid="score-timeline" className="flex items-center gap-3">
              <Sparkline data={serie} width={140} height={40} />
              {timelineTexto ? <p className="text-xs text-dim">{timelineTexto}</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-4">
            <Link href={atual ? `/dashboard/relatorios/${atual.id}` : '#'} className="text-sm text-brand hover:underline">
              Ver breakdown →
            </Link>
            <a href="#historico" className="text-sm text-brand hover:underline">
              Ver histórico →
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
