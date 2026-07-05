import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ScoreGauge } from '@/components/ui/charts/ScoreGauge';
import type { ReportDetail } from '@/modules/reports/report.types';

export function TruthScoreCard({ atual, anterior }: { atual: ReportDetail | null; anterior: ReportDetail | null }) {
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
        <div className="space-y-1">
          <p className="text-sm text-muted">Saúde da operação no último relatório.</p>
          {delta !== null && (
            <p className={`text-sm font-medium ${delta >= 0 ? 'text-brand' : 'text-red-400'}`} data-testid="score-delta">
              {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{delta} vs relatório anterior
            </p>
          )}
          <a href={atual ? `/dashboard/relatorios/${atual.id}` : '#'} className="text-sm text-brand hover:underline">
            Ver breakdown →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
