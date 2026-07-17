import { and, desc, gte, inArray, lte } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations, orders, reports } from '@/db/schema';
import { fimDeDiaUtc, hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';
import type { ConexaoSaude } from '@/modules/admin/admin.repository';
import { detectarQuedaVendas } from '@/modules/alerts/alert-detectors';
import { getCarteira } from '@/modules/analista/analista.repository';
import { calcularRisco, type InsumosRisco, type RiscoOrg } from '@/modules/analista/score-risco';
import type { Plano, UserAccess } from '@/modules/auth/user.types';
import { montarCobertura } from '@/modules/estoque/stock-coverage';
import { getStockRows, getVendas30dPorSku } from '@/modules/estoque/stock.repository';
import { diasDoPlano } from '@/modules/pipeline/plan-lock';
import { deltaNumero, paceMeta } from '@/modules/reports/compare';
import { diasDesde } from '@/modules/tasks/sla';

// ---------------------------------------------------------------------------
// Command center da carteira (H4 T3) — agrega TODOS os insumos do score de
// risco (T2) por org, escopados pelo PAPEL (nunca por access.orgId): analista
// vê só a própria carteira, admin vê todas as orgs cliente. A base de
// escopo+contagem de tasks é a mesma de `getCarteira` (analista.repository) —
// reusada diretamente (não reimplementada) para não divergir do escopo já
// testado ali. Os demais insumos (vendas, conexão, relatórios, estoque, meta)
// são coletados em queries batched por IN(orgIds) — uma query por insumo para
// a carteira INTEIRA, nunca uma query por org (exceto estoque: aceito por-org
// aqui, carteiras são pequenas — mesma decisão do plano).
// ---------------------------------------------------------------------------

export type OrgResumo = {
  orgId: string;
  orgName: string;
  nicho: string | null;
  faturamentoMes: number;
  faturamentoMesAnterior: number;
  tasksAbertas: number;
  tasksAtrasadas: number;
  pendentesRevisao: number;
  risco: RiscoOrg;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** meta em risco = pace < 80% a partir do dia 15 do mês (Decisões de plano H4). */
const META_EM_RISCO_DIA_MINIMO = 15;
const META_EM_RISCO_PCT_LIMITE = 80;

function calcularMetaEmRisco(totalMesAtual: number, metaMensal: number | null, hojeIso: string): boolean {
  if (metaMensal === null || metaMensal <= 0) return false;
  const dia = Number(hojeIso.slice(8, 10));
  if (dia < META_EM_RISCO_DIA_MINIMO) return false;
  const pace = paceMeta(totalMesAtual, metaMensal, hojeIso);
  return pace !== null && pace.pctReal < META_EM_RISCO_PCT_LIMITE;
}

/**
 * Saúde da conexão a partir das colunas cruas — mesma regra de
 * `saudeFromRow` em admin.repository.ts (não exportada de lá; duplicada aqui
 * localmente para não tocar naquele módulo por uma função de 3 linhas).
 */
function saudeConexao(status: string | null, accessToken: string | null): ConexaoSaude {
  if (status === null) return 'nenhuma';
  if (status === 'ok' && accessToken !== null) return 'ok';
  if (status === 'expirado') return 'expirado';
  return 'erro';
}

type OrgDetalhes = { nicho: string | null; plano: Plano | null; metaMensal: number | null };

/** nicho/plano/meta_mensal em lote — evita N chamadas a getOrgSettings/getOrganizationById (helpers de 1 org). */
async function getOrgDetalhesBatch(orgIds: string[]): Promise<Map<string, OrgDetalhes>> {
  const rows = await db
    .select({
      id: organizations.id,
      nicho: organizations.nicho,
      plano: organizations.plano,
      meta_mensal: organizations.meta_mensal,
    })
    .from(organizations)
    .where(inArray(organizations.id, orgIds));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        nicho: r.nicho,
        plano: (r.plano as Plano | null) ?? null,
        metaMensal: r.meta_mensal === null ? null : Number(r.meta_mensal),
      },
    ]),
  );
}

type TotaisMensais = { atual: number; anterior: number };

/**
 * Faturamento do mês corrente + mês anterior por org, em UMA query para toda
 * a carteira (IN orgIds) — adaptação batched de `getTotalVendasMesCorrente`/
 * `getTotalVendasMesAnterior` (organization-settings.repository), que são
 * por-org. Soma feita em JS (não SUM/CASE no banco): interpolar Date dentro de
 * `sql` quebra o postgres-js quando a coluna não tem mapper de driver (lição
 * já registrada em report.repository.ts/tempoMedioConclusaoDias) — mais
 * seguro comparar em JS com os operadores tipados (`gte`/`lte`) só no WHERE.
 */
async function getTotaisMensaisBatch(orgIds: string[], agora: Date): Promise<Map<string, TotaisMensais>> {
  const hoje = hojeBrt(agora);
  const inicioMesAtual = inicioDeDiaUtc(`${hoje.slice(0, 7)}-01`);
  const fimHoje = fimDeDiaUtc(hoje);
  const inicioMesAnterior = new Date(
    Date.UTC(inicioMesAtual.getUTCFullYear(), inicioMesAtual.getUTCMonth() - 1, 1),
  );

  const rows = await db
    .select({ orgId: orders.org_id, data: orders.data, valor_total: orders.valor_total })
    .from(orders)
    .where(and(inArray(orders.org_id, orgIds), gte(orders.data, inicioMesAnterior), lte(orders.data, fimHoje)));

  const acc = new Map<string, TotaisMensais>();
  for (const o of rows) {
    const cur = acc.get(o.orgId) ?? { atual: 0, anterior: 0 };
    const valor = Number(o.valor_total);
    if (o.data >= inicioMesAtual) cur.atual += valor;
    else cur.anterior += valor;
    acc.set(o.orgId, cur);
  }
  for (const [orgId, v] of acc) acc.set(orgId, { atual: round2(v.atual), anterior: round2(v.anterior) });
  return acc;
}

type TotaisSemanais = { total7dias: number; totaisSemanasAnteriores: number[] };

/**
 * Total 7d + 4 semanas anteriores por org, em UMA query para toda a carteira
 * — adaptação batched de `getTotaisSemanais` (alert-data.repository), que é
 * por-org. Mesma matemática de buckets (idade em janelas de 7 dias), só que
 * acumulada por orgId em vez de um total só.
 */
async function getTotaisSemanaisBatch(orgIds: string[], agora: Date): Promise<Map<string, TotaisSemanais>> {
  const inicio = new Date(agora.getTime() - 35 * 86_400_000);
  const rows = await db
    .select({ orgId: orders.org_id, data: orders.data, valor_total: orders.valor_total })
    .from(orders)
    .where(and(inArray(orders.org_id, orgIds), gte(orders.data, inicio), lte(orders.data, agora)));

  const buckets = new Map<string, number[]>();
  for (const o of rows) {
    const idade = Math.floor((agora.getTime() - o.data.getTime()) / (7 * 86_400_000));
    if (idade < 0 || idade >= 5) continue;
    const arr = buckets.get(o.orgId) ?? [0, 0, 0, 0, 0];
    arr[idade] += Number(o.valor_total);
    buckets.set(o.orgId, arr);
  }

  const result = new Map<string, TotaisSemanais>();
  for (const orgId of orgIds) {
    const arr = buckets.get(orgId) ?? [0, 0, 0, 0, 0];
    result.set(orgId, { total7dias: round2(arr[0]!), totaisSemanasAnteriores: arr.slice(1).map(round2) });
  }
  return result;
}

type ConexaoInfo = { saude: ConexaoSaude; horasParaExpirar: number | null };

/** Saúde da conexão Bling por org, em UMA query (IN orgIds) — mesmo padrão de `listConnectionsExpirando`. */
async function getConexoesBatch(orgIds: string[], agora: Date): Promise<Map<string, ConexaoInfo>> {
  const rows = await db
    .select({
      orgId: connections.org_id,
      status: connections.status,
      access_token: connections.access_token,
      expira_em: connections.expira_em,
    })
    .from(connections)
    .where(and(inArray(connections.org_id, orgIds), inArray(connections.provider, ['bling'])));

  return new Map(
    rows.map((r) => {
      const saude = saudeConexao(r.status, r.access_token);
      const horasParaExpirar =
        saude === 'ok' && r.expira_em ? (r.expira_em.getTime() - agora.getTime()) / 3_600_000 : null;
      return [r.orgId, { saude, horasParaExpirar }];
    }),
  );
}

type ReportsInfo = { ultimoReportFailed: boolean; diasSemReportDone: number | null };

/**
 * Último status (qualquer) + dias desde o último `done`, por org, em UMA
 * query (IN orgIds) ordenada por created_at desc: a primeira linha de cada
 * org, na varredura, já é a mais recente (mesmo truque de agregação em JS de
 * `getCarteira`). Evita DISTINCT ON (sem precedente no projeto) sem virar N+1.
 */
async function getReportsInfoBatch(orgIds: string[], agora: Date): Promise<Map<string, ReportsInfo>> {
  const rows = await db
    .select({ orgId: reports.org_id, status: reports.status, createdAt: reports.created_at })
    .from(reports)
    .where(inArray(reports.org_id, orgIds))
    .orderBy(desc(reports.created_at));

  const latestAny = new Map<string, string>();
  const latestDone = new Map<string, Date>();
  for (const r of rows) {
    if (!latestAny.has(r.orgId)) latestAny.set(r.orgId, r.status);
    if (r.status === 'done' && !latestDone.has(r.orgId)) latestDone.set(r.orgId, r.createdAt);
  }

  const result = new Map<string, ReportsInfo>();
  for (const orgId of orgIds) {
    const done = latestDone.get(orgId);
    result.set(orgId, {
      ultimoReportFailed: latestAny.get(orgId) === 'failed',
      diasSemReportDone: done ? diasDesde(done, agora) : null,
    });
  }
  return result;
}

/**
 * SKUs em estoque crítico por org — POR ORG (aceito explicitamente pelo
 * plano: carteiras são pequenas). Reusa `getStockRows` + `getVendas30dPorSku`
 * + `montarCobertura` (mesmo pipeline do módulo de estoque).
 */
async function contarSkusCriticos(orgId: string, agora: Date): Promise<number> {
  const [stock, vendas30d] = await Promise.all([getStockRows(orgId), getVendas30dPorSku(orgId, agora)]);
  return montarCobertura(stock, vendas30d).filter((p) => p.estado === 'critico').length;
}

/**
 * Resumo de carteira por org, escopado pelo PAPEL (analista: só a carteira
 * própria; admin: todas as orgs cliente) — escopo e contagem de tasks vêm
 * direto de `getCarteira` (NUNCA reimplementados aqui, para não divergir).
 * Os demais insumos do risco são coletados em queries batched (IN orgIds);
 * só o estoque é por-org (decisão do plano). `calcularRisco` (T2) fecha o
 * score/nível/motivos de cada org.
 */
export async function carteiraResumo(access: UserAccess, agora: Date): Promise<OrgResumo[]> {
  const carteira = await getCarteira(access);
  if (carteira.length === 0) return [];
  const orgIds = carteira.map((c) => c.orgId);
  const hoje = hojeBrt(agora);

  const [detalhes, mensais, semanais, conexoes, reportsInfo, skusCriticos] = await Promise.all([
    getOrgDetalhesBatch(orgIds),
    getTotaisMensaisBatch(orgIds, agora),
    getTotaisSemanaisBatch(orgIds, agora),
    getConexoesBatch(orgIds, agora),
    getReportsInfoBatch(orgIds, agora),
    Promise.all(orgIds.map((id) => contarSkusCriticos(id, agora))),
  ]);
  const skusCriticosMap = new Map(orgIds.map((id, i) => [id, skusCriticos[i]!]));

  return carteira.map((c) => {
    const det = detalhes.get(c.orgId) ?? { nicho: null, plano: null, metaMensal: null };
    const mensal = mensais.get(c.orgId) ?? { atual: 0, anterior: 0 };
    const semanal = semanais.get(c.orgId) ?? { total7dias: 0, totaisSemanasAnteriores: [0, 0, 0, 0] };
    const conexao = conexoes.get(c.orgId) ?? { saude: 'nenhuma' as ConexaoSaude, horasParaExpirar: null };
    const repInfo = reportsInfo.get(c.orgId) ?? { ultimoReportFailed: false, diasSemReportDone: null };
    const tasksAbertas = c.counts.backlog + c.counts.todo + c.counts.em_andamento + c.counts.em_revisao;

    const insumos: InsumosRisco = {
      conexao: conexao.saude,
      tokenExpiraEmHoras: conexao.horasParaExpirar,
      ultimoReportFailed: repInfo.ultimoReportFailed,
      diasSemReportDone: repInfo.diasSemReportDone,
      // org sem plano definido: usa a janela mais tolerante (monthly=30) —
      // não penaliza risco por uma configuração ainda pendente do admin.
      diasDoPlano: diasDoPlano(det.plano ?? 'monthly'),
      quedaVendas: detectarQuedaVendas(semanal) !== null,
      tasksAtrasadas: c.atrasadas,
      skusEstoqueCritico: skusCriticosMap.get(c.orgId) ?? 0,
      metaEmRisco: calcularMetaEmRisco(mensal.atual, det.metaMensal, hoje),
    };

    return {
      orgId: c.orgId,
      orgName: c.orgName,
      nicho: det.nicho,
      faturamentoMes: mensal.atual,
      faturamentoMesAnterior: mensal.anterior,
      tasksAbertas,
      tasksAtrasadas: c.atrasadas,
      pendentesRevisao: c.emRevisao,
      risco: calcularRisco(insumos),
    };
  });
}

export type KpisCarteira = {
  totalOrgs: number;
  faturamentoMes: number;
  faturamentoMesAnterior: number;
  variacaoFaturamentoPct: number | null;
  tasksAbertas: number;
  tasksAtrasadas: number;
  pendentesRevisao: number;
  orgsEmRisco: number;
};

/**
 * KPIs agregados da carteira (hero do command center) — puro, sem I/O.
 * DECISÃO: mora aqui (não em `carteira-view-model.ts`) porque T5 ainda não
 * existe e este módulo já é o dono de `OrgResumo`; T5 pode reexportar ou
 * mover se o view-model do command center pedir outra forma. `orgsEmRisco`
 * conta orgs com nível != 'ok' (atencao + critico).
 */
export function kpisDaCarteira(resumos: OrgResumo[]): KpisCarteira {
  const faturamentoMes = round2(resumos.reduce((s, r) => s + r.faturamentoMes, 0));
  const faturamentoMesAnterior = round2(resumos.reduce((s, r) => s + r.faturamentoMesAnterior, 0));
  return {
    totalOrgs: resumos.length,
    faturamentoMes,
    faturamentoMesAnterior,
    variacaoFaturamentoPct: deltaNumero(faturamentoMes, faturamentoMesAnterior).deltaPct,
    tasksAbertas: resumos.reduce((s, r) => s + r.tasksAbertas, 0),
    tasksAtrasadas: resumos.reduce((s, r) => s + r.tasksAtrasadas, 0),
    pendentesRevisao: resumos.reduce((s, r) => s + r.pendentesRevisao, 0),
    orgsEmRisco: resumos.filter((r) => r.risco.nivel !== 'ok').length,
  };
}
