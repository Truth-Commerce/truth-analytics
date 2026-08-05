import { proximasDatas } from '@/lib/calendario-comercial';
import type { Plano } from '@/modules/auth/user.types';
import { agruparPorMes } from '@/modules/desempenho/desempenho-anual';
import { getCoberturaHistorico, getPedidos12Meses } from '@/modules/desempenho/desempenho-anual.repository';
import { getOrgSettings, getTotalVendasMesCorrente } from '@/modules/organizations/organization-settings.repository';
import type { AnalysisContext } from '@/modules/pipeline/steps/analyze-ia';
import type { Periodo } from '@/modules/providers/types';
import type { ErpDataSource } from '@/modules/providers/data.types';
import { totalVendas } from '@/modules/reports/compare';
import { getUltimosDoneDetalhados } from '@/modules/reports/report.repository';

export const CALENDARIO_JANELA_DIAS = 60;
/** Mesma janela do getPedidos12Meses — a agregação precisa cobrir exatamente o que veio do banco. */
const MESES_CONTEXTO_ANUAL = 12;

/**
 * Monta o contexto rico do prompt v2. Chamado pelo orquestrador DURANTE a
 * etapa 'analisando_ia' — o report corrente ainda está 'running', então
 * getUltimosDoneDetalhados(orgId, 1) devolve o done ANTERIOR.
 */
export async function buildAnalysisContext(input: {
  orgId: string;
  orgName: string;
  nicho: string | null;
  plano: Plano;
  periodo: Periodo;
  source: ErpDataSource;
}): Promise<AnalysisContext> {
  const agora = new Date();
  // O histórico anual é enriquecimento do prompt, não requisito do relatório: se a
  // leitura falhar, o report continua sendo gerado sem a seção anual.
  const [settings, totalMesCorrente, anteriores, pedidos12m, cobertura] = await Promise.all([
    getOrgSettings(input.orgId),
    getTotalVendasMesCorrente(input.source),
    getUltimosDoneDetalhados(input.orgId, 1, input.source),
    getPedidos12Meses(input.source, agora).catch(() => null),
    getCoberturaHistorico(input.source).catch(() => null),
  ]);
  const anterior = anteriores[0];
  const serieAnual = pedidos12m ? agruparPorMes(pedidos12m, agora, MESES_CONTEXTO_ANUAL) : null;
  const contextoAnual = serieAnual?.some((m) => m.pedidos > 0) ? serieAnual : null;
  const coberturaAnual =
    contextoAnual && cobertura ? { pendentesEnriquecimento: cobertura.pendentesEnriquecimento } : null;
  return {
    orgName: input.orgName,
    nicho: input.nicho,
    plano: input.plano,
    periodo: input.periodo,
    metaMensal: settings?.metaMensal ?? null,
    totalMesCorrente,
    relatorioAnterior: anterior?.metricas
      ? {
          periodo: { inicio: anterior.periodoInicio, fim: anterior.periodoFim },
          resumoExecutivo: anterior.analiseIa?.resumoExecutivo ?? '',
          recomendacoes: anterior.analiseIa
            ? [...anterior.analiseIa.gargalos, ...anterior.analiseIa.sugestoesMelhoria].slice(0, 8)
            : [],
          totalPeriodo: anterior.metricas.truth_score?.totalPeriodo ?? totalVendas(anterior.metricas),
        }
      : null,
    datasComerciais: proximasDatas(input.periodo.fim, CALENDARIO_JANELA_DIAS),
    contextoAnual,
    coberturaAnual,
  };
}
