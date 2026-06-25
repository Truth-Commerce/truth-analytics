import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

export type ReportStatus = 'queued' | 'running' | 'done' | 'failed';

export type ReportSummary = {
  id: string;
  status: ReportStatus;
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
