import { proximasDatas } from '@/lib/calendario-comercial';
import type { Plano } from '@/modules/auth/user.types';
import { getOrgSettings, getTotalVendasMesCorrente } from '@/modules/organizations/organization-settings.repository';
import type { AnalysisContext } from '@/modules/pipeline/steps/analyze-ia';
import type { Periodo } from '@/modules/providers/types';
import { totalVendas } from '@/modules/reports/compare';
import { getUltimosDoneDetalhados } from '@/modules/reports/report.repository';

export const CALENDARIO_JANELA_DIAS = 60;

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
}): Promise<AnalysisContext> {
  const [settings, totalMesCorrente, anteriores] = await Promise.all([
    getOrgSettings(input.orgId),
    getTotalVendasMesCorrente(input.orgId),
    getUltimosDoneDetalhados(input.orgId, 1),
  ]);
  const anterior = anteriores[0];
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
  };
}
