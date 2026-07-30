import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import type { ErpProviderId } from '@/modules/providers/types';

export type ReportStatus = 'queued' | 'running' | 'done' | 'failed';

export type ReportEtapa =
  | 'coletando_vendas'
  | 'analisando_mercado'
  | 'analisando_ia'
  | 'finalizando';

export type ReportSummary = {
  id: string;
  status: ReportStatus;
  /** Fonte congelada no início da execução; relatórios legados usam bling/1. */
  sourceProvider?: ErpProviderId;
  sourceGeneration?: number;
  periodoInicio: Date;
  periodoFim: Date;
  createdAt: Date;
};

export type ReportDetail = ReportSummary & {
  metricas: Metricas | null;
  analiseIa: AnaliseIa | null;
  erro: string | null;
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  queued: 'Na fila',
  running: 'Em andamento',
  done: 'Concluído',
  failed: 'Falhou',
};

/** Variante de Badge por status de relatório (done=verde, em progresso=amarelo, falha=vermelho). */
export function reportStatusVariant(
  status: string,
): 'success' | 'warn' | 'danger' | 'neutral' {
  if (status === 'done') return 'success';
  if (status === 'queued' || status === 'running') return 'warn';
  if (status === 'failed') return 'danger';
  return 'neutral';
}
