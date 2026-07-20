/**
 * Score de risco da carteira — puro (testável em node).
 * Pesos exatos das Decisões de plano (Programa H §4 H4):
 * conexão expirado=30 / erro=25 / expirando<72h=15 (só o maior aplicável, nunca soma);
 * ultimoReportFailed=25; diasSemReportDone > diasDoPlano+7 → 20; quedaVendas=20;
 * tasksAtrasadas×5 cap 15; skusEstoqueCritico×4 cap 12; metaEmRisco=10. Cap total 100.
 */

export type InsumosRisco = {
  conexao: 'ok' | 'expirado' | 'erro' | 'nenhuma';
  tokenExpiraEmHoras: number | null;
  ultimoReportFailed: boolean;
  diasSemReportDone: number | null;
  diasDoPlano: number;
  quedaVendas: boolean;
  tasksAtrasadas: number;
  skusEstoqueCritico: number;
  metaEmRisco: boolean;
};

export type RiscoOrg = {
  score: number;
  nivel: 'critico' | 'atencao' | 'ok';
  motivos: string[];
};

const TOKEN_EXPIRA_LIMITE_HORAS = 72;
const PESO_CONEXAO_EXPIRADO = 30;
const PESO_CONEXAO_ERRO = 25;
const PESO_CONEXAO_EXPIRANDO = 15;
const PESO_ULTIMO_REPORT_FAILED = 25;
const PESO_DIAS_SEM_REPORT = 20;
const PESO_QUEDA_VENDAS = 20;
const PESO_POR_TASK_ATRASADA = 5;
const CAP_TASKS_ATRASADAS = 15;
const PESO_POR_SKU_CRITICO = 4;
const CAP_SKUS_CRITICOS = 12;
const PESO_META_EM_RISCO = 10;
const SCORE_MAX = 100;
const LIMIAR_CRITICO = 50;
const LIMIAR_ATENCAO = 25;

type Motivo = { peso: number; texto: string };

function insumoConexao(i: InsumosRisco): Motivo | null {
  if (i.conexao === 'expirado') return { peso: PESO_CONEXAO_EXPIRADO, texto: 'Conexão Bling expirada' };
  if (i.conexao === 'erro') return { peso: PESO_CONEXAO_ERRO, texto: 'Erro na conexão Bling' };
  if (
    i.conexao === 'ok' &&
    i.tokenExpiraEmHoras !== null &&
    i.tokenExpiraEmHoras < TOKEN_EXPIRA_LIMITE_HORAS
  ) {
    return { peso: PESO_CONEXAO_EXPIRANDO, texto: 'Conexão Bling expirando em breve' };
  }
  return null;
}

/** Computa o score de risco (0-100) e os motivos pt-BR, ordenados por peso desc. */
export function calcularRisco(i: InsumosRisco): RiscoOrg {
  const motivos: Motivo[] = [];

  const conexao = insumoConexao(i);
  if (conexao) motivos.push(conexao);

  if (i.ultimoReportFailed) {
    motivos.push({ peso: PESO_ULTIMO_REPORT_FAILED, texto: 'Último relatório falhou' });
  }

  if (i.diasSemReportDone !== null && i.diasSemReportDone > i.diasDoPlano + 7) {
    motivos.push({ peso: PESO_DIAS_SEM_REPORT, texto: 'Sem relatório concluído há muito tempo' });
  }

  if (i.quedaVendas) {
    motivos.push({ peso: PESO_QUEDA_VENDAS, texto: 'Queda nas vendas' });
  }

  if (i.tasksAtrasadas > 0) {
    const peso = Math.min(i.tasksAtrasadas * PESO_POR_TASK_ATRASADA, CAP_TASKS_ATRASADAS);
    const plural = i.tasksAtrasadas === 1 ? 'tarefa atrasada' : 'tarefas atrasadas';
    motivos.push({ peso, texto: `${i.tasksAtrasadas} ${plural}` });
  }

  if (i.skusEstoqueCritico > 0) {
    const peso = Math.min(i.skusEstoqueCritico * PESO_POR_SKU_CRITICO, CAP_SKUS_CRITICOS);
    motivos.push({ peso, texto: `${i.skusEstoqueCritico} SKUs em estoque crítico` });
  }

  if (i.metaEmRisco) {
    motivos.push({ peso: PESO_META_EM_RISCO, texto: 'Meta em risco' });
  }

  const scoreBruto = motivos.reduce((soma, m) => soma + m.peso, 0);
  const score = Math.min(scoreBruto, SCORE_MAX);
  const nivel = score >= LIMIAR_CRITICO ? 'critico' : score >= LIMIAR_ATENCAO ? 'atencao' : 'ok';

  const motivosOrdenados = [...motivos].sort((a, b) => b.peso - a.peso).map((m) => m.texto);

  return { score, nivel, motivos: motivosOrdenados };
}
