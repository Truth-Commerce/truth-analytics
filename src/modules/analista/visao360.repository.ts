/**
 * Agregador de leituras da Visão 360 do analista (H4 T6) — as camadas
 * EXCLUSIVAS do painel do analista (o que o cliente não vê): histórico do
 * Truth Score, cobertura de estoque, kits do ciclo, sugestões do calendário,
 * linha do tempo de alertas, tasks concluídas com impacto e a pauta IA
 * (briefing) do ciclo mais recente.
 *
 * Toda leitura aqui é escopada por `orgId` (multi-tenancy) — o controle de
 * ACESSO (a org pertence à carteira do analista, ou o papel é admin) já foi
 * feito por `assertOrgAccess` na página chamadora; este módulo não reconfere
 * papel, só agrega dados de UMA org já autorizada. Nada aqui reimplementa
 * lógica que já existe em outro repositório — cada camada reusa a função
 * existente (estoque/kits/calendário/alertas/tasks/briefing).
 */
import { getUltimaDataPedido } from '@/modules/alerts/alert-data.repository';
import { getActiveErpConnection } from '@/modules/connections/active-provider.repository';
import { listAlertasTimeline, type AlertaTimeline } from '@/modules/alerts/alert.repository';
import { BriefingIaSchema, type BriefingIa } from '@/modules/analista/briefing-ia';
import { getBriefingUltimoCiclo } from '@/modules/analista/briefing.repository';
import { montarCobertura, type CoberturaProduto } from '@/modules/estoque/stock-coverage';
import { getStockRows, getVendas30dPorSku } from '@/modules/estoque/stock.repository';
import { formatDiaMes } from '@/lib/format';
import { listSugestoesUltimoCiclo } from '@/modules/calendario/calendario.repository';
import { sugestaoView, type SugestaoView } from '@/modules/calendario/calendario-view-model';
import { listKitsUltimoCiclo } from '@/modules/kits/kit.repository';
import { kitView, type KitView } from '@/modules/kits/kits-view-model';
import { getUltimosDoneDetalhados } from '@/modules/reports/report.repository';
import { getTaskImpact, type TaskImpact } from '@/modules/tasks/task-impact';
import { listTasksByOrg } from '@/modules/tasks/task.repository';
import type { TaskSummary } from '@/modules/tasks/task.types';

/** Quantos relatórios `done` entram no gráfico de histórico do Truth Score. */
const SCORE_HISTORICO_LIMITE = 50;
/** Quantos alertas (abertos + resolvidos) entram na linha do tempo. */
const ALERTAS_TIMELINE_LIMITE = 20;
/** Quantas tasks concluídas recentes tentam calcular impacto. */
const TASKS_IMPACTO_LIMITE = 10;

export type ScoreHistoricoPonto = { label: string; score: number };

export type TaskComImpacto = {
  task: TaskSummary;
  impacto: NonNullable<TaskImpact>;
};

export type Visao360Data = {
  /** Ordem CRONOLÓGICA (mais antigo primeiro) — pronta para o LineChart. */
  scoreHistorico: ScoreHistoricoPonto[];
  estoque: CoberturaProduto[];
  kits: KitView[];
  sugestoesCalendario: SugestaoView[];
  /** Últimos alertas, abertos primeiro (ver `listAlertasTimeline`). */
  alertas: AlertaTimeline[];
  tasksImpacto: TaskComImpacto[];
  briefing: BriefingIa | null;
  briefingCriadoEm: Date | null;
};

/**
 * Agrega as 7 camadas exclusivas da visão 360 em paralelo (uma leitura por
 * camada, todas escopadas por `orgId`). `agora` só é usado para a janela de
 * velocidade de vendas do estoque (mesma semântica de `getStockRows` +
 * `getVendas30dPorSku` no dashboard do cliente) — default `new Date()` para
 * chamadas de produção; testes passam um instante fixo.
 */
export async function getVisao360(orgId: string, _agora: Date = new Date()): Promise<Visao360Data> {
  const source = await getActiveErpConnection(orgId);
  const [donesDetalhados, stockRows, agoraEfetivo, kitsRows, sugestoesRows, alertas, todasTasks, briefingRow] =
    await Promise.all([
      source ? getUltimosDoneDetalhados(orgId, SCORE_HISTORICO_LIMITE, source) : Promise.resolve([]),
      source ? getStockRows(source) : Promise.resolve([]),
      source ? getUltimaDataPedido(source) : Promise.resolve(null),
      listKitsUltimoCiclo(orgId),
      listSugestoesUltimoCiclo(orgId),
      listAlertasTimeline(orgId, ALERTAS_TIMELINE_LIMITE),
      listTasksByOrg(orgId),
      getBriefingUltimoCiclo(orgId),
    ]);

  // Sem nenhum pedido ainda: vendas30d fica vazio (mesmo fallback do dashboard/estoque).
  const fimJanelaVendas = agoraEfetivo ?? _agora;
  const vendas30d = source && agoraEfetivo ? await getVendas30dPorSku(source, fimJanelaVendas) : new Map<string, number>();
  const estoque = montarCobertura(stockRows, vendas30d);

  // getUltimosDoneDetalhados vem desc (mais recente primeiro) — reverte para
  // a ordem cronológica que o LineChart espera (esquerda = mais antigo).
  const scoreHistorico: ScoreHistoricoPonto[] = donesDetalhados
    .filter((r) => r.metricas?.truth_score?.score != null)
    .map((r) => ({ label: formatDiaMes(r.createdAt), score: r.metricas!.truth_score!.score }))
    .reverse();

  // "Tasks com impacto": as concluídas mais recentes (proxy: createdAt, já
  // que TaskSummary não carrega updatedAt) que têm comparação possível
  // (getTaskImpact retorna null quando não há relatório done posterior).
  const concluidas = todasTasks
    .filter((t) => t.status === 'concluida')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, TASKS_IMPACTO_LIMITE);
  const impactos = await Promise.all(concluidas.map((t) => getTaskImpact(t.id, orgId)));
  const tasksImpacto: TaskComImpacto[] = concluidas
    .map((task, i) => ({ task, impacto: impactos[i]! }))
    .filter((x): x is TaskComImpacto => x.impacto !== null);

  // Validação defensiva do payload jsonb (mesmo padrão de MetricasSchema.safeParse
  // em impacto-renovacao.ts) — payload corrompido/antigo vira "sem pauta", nunca crasha.
  const briefingParsed = briefingRow ? BriefingIaSchema.safeParse(briefingRow.payload) : null;

  return {
    scoreHistorico,
    estoque,
    kits: kitsRows.map(kitView),
    sugestoesCalendario: sugestoesRows.map(sugestaoView),
    alertas,
    tasksImpacto,
    briefing: briefingParsed?.success ? briefingParsed.data : null,
    briefingCriadoEm: briefingRow?.created_at ?? null,
  };
}
