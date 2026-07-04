import type { ReportEtapa, ReportStatus } from './report.types';

/** Contrato F0: coluna reports.etapa atualizada pelo orquestrador entre steps. */
export type EtapaPipeline = ReportEtapa;

/** Passos exibidos no stepper cinematográfico (copy travada). */
export const ETAPAS_GERACAO = [
  { id: 'conectando', label: 'Conectando ao Bling' },
  { id: 'coletando_vendas', label: 'Coletando pedidos' },
  { id: 'analisando_mercado', label: 'Varrendo o mercado' },
  { id: 'analisando_ia', label: 'IA analisando' },
  { id: 'finalizando', label: 'Finalizando' },
] as const;

export type GeracaoView = {
  activeIndex: number;
  failed: boolean;
  done: boolean;
};

/** Converte {status, etapa} do endpoint F0 no estado visual do stepper (pura). */
export function geracaoView(status: ReportStatus, etapa: EtapaPipeline | null): GeracaoView {
  if (status === 'done') {
    return { activeIndex: ETAPAS_GERACAO.length, failed: false, done: true };
  }
  const idx = etapa ? ETAPAS_GERACAO.findIndex((e) => e.id === etapa) : 0;
  const activeIndex = idx === -1 ? 0 : idx;
  if (status === 'failed') {
    return { activeIndex, failed: true, done: false };
  }
  return { activeIndex, failed: false, done: false };
}
