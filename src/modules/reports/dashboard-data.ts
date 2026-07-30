import { getOrganizationById, type ClientOrganization } from '@/modules/admin/admin.repository';
import { getUltimaDataPedido } from '@/modules/alerts/alert-data.repository';
import { listAlertasAbertos, type AlertaAberto } from '@/modules/alerts/alert.repository';
import { getConnection } from '@/modules/connections/connection.repository';
import { getActiveErpConnection } from '@/modules/connections/active-provider.repository';
import {
  getOrgSettings,
  getTotalVendasMesCorrente,
} from '@/modules/organizations/organization-settings.repository';
import { listTaskTitulosAbertos } from '@/modules/tasks/task.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { fontesRelatorioCompativeis } from '@/modules/reports/compare';

import {
  getUltimosDoneDetalhados,
  listHistoricoDashboard,
  type HistoricoDashboardRow,
} from './report.repository';
import type { ReportDetail, ReportSummary } from './report.types';

export type DashboardData = {
  conn: Awaited<ReturnType<typeof getConnection>>;
  org: ClientOrganization | null;
  settings: { geracaoAutomatica: boolean; metaMensal: number | null } | null;
  historico: HistoricoDashboardRow[];
  latest: ReportSummary | null;
  latestDone: ReportDetail | null;
  doneAnterior: ReportDetail | null;
  temProdutos: boolean;
  alertas: AlertaAberto[];
  totalMes: number;
  titulosTasksUltimoDone: string[];
  ultimaDataPedido: Date | null;
};

/**
 * View-model único do dashboard (Promise.all preservado). Dedupe das queries
 * da page antiga: getLatestReport ≡ historico[0] e getLatestDoneReport ≡
 * getUltimosDoneDetalhados[0] (evidência: page.tsx:38-50 pré-G2). Os jsonb
 * pesados só são puxados para os 2 últimos done (score card, stats, charts,
 * ação nº 1); o histórico usa extração no SQL.
 */
export async function getDashboardData(orgId: string): Promise<DashboardData> {
  const source = await getActiveErpConnection(orgId);
  const [historico, conn, org, doneMaisRecente, produtos, alertas, settings, totalMes, ultimaDataPedido] =
    await Promise.all([
      listHistoricoDashboard(orgId),
      getConnection(orgId),
      getOrganizationById(orgId),
      getUltimosDoneDetalhados(orgId, 1),
      listTrackedProducts(orgId),
      listAlertasAbertos(orgId),
      getOrgSettings(orgId),
      source ? getTotalVendasMesCorrente(source) : Promise.resolve(0),
      source ? getUltimaDataPedido(source) : Promise.resolve(null),
    ]);

  const latestDone = doneMaisRecente[0] ?? null;
  // O cartão atual/anterior nunca mistura gerações de ERP. A fonte é a do
  // relatório atual, não a conexão ativa (que pode ter trocado depois dele).
  const donesRecentes = latestDone !== null && fontesRelatorioCompativeis(latestDone, latestDone)
    ? await getUltimosDoneDetalhados(orgId, 2, latestDone)
    : latestDone ? [latestDone] : [];
  // Dependente do latestDone — fora do Promise.all de propósito.
  const titulosTasksUltimoDone = latestDone?.analiseIa
    ? await listTaskTitulosAbertos(orgId)
    : [];

  const primeiro = historico[0] ?? null;
  const latest: ReportSummary | null = primeiro
    ? {
        id: primeiro.id,
        status: primeiro.status,
        sourceProvider: primeiro.sourceProvider,
        sourceGeneration: primeiro.sourceGeneration,
        periodoInicio: primeiro.periodoInicio,
        periodoFim: primeiro.periodoFim,
        createdAt: primeiro.createdAt,
      }
    : null;

  return {
    conn,
    org,
    settings,
    historico,
    latest,
    latestDone,
    doneAnterior: donesRecentes[1] ?? null,
    temProdutos: produtos.length > 0,
    alertas,
    totalMes,
    titulosTasksUltimoDone,
    ultimaDataPedido,
  };
}
