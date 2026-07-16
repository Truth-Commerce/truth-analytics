import { formatBRL } from '@/lib/format';
import type { Achado } from '@/modules/pipeline/contracts';
import { CHECKLIST_UNCHECKED } from './checklist-line';
import type { TaskPrioridade, TaskTipo } from './task.types';

export const FONTES_ANALISE = ['gargalos', 'sugestoesMelhoria', 'ideiasVenda', 'achados'] as const;
export type FonteAnalise = (typeof FONTES_ANALISE)[number];

export const PRIORIDADE_POR_FONTE: Record<FonteAnalise, TaskPrioridade> = {
  gargalos: 'alta',
  sugestoesMelhoria: 'media',
  ideiasVenda: 'baixa',
  achados: 'media', // fallback formal — a prioridade REAL vem do próprio achado
};

export function normalizarTexto(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

// Ordem de precedência: preco > logistica > anuncio > catalogo > conta > outro.
const REGRAS: ReadonlyArray<{ tipo: TaskTipo; re: RegExp }> = [
  { tipo: 'preco', re: /(preco|precific|margem|desconto|reajust|mais barato|mais caro)/ },
  { tipo: 'logistica', re: /(frete|envio|entrega|logistic|fulfillment|\bfull\b|prazo)/ },
  { tipo: 'anuncio', re: /(anuncio|titulo|foto|imagem|descricao|\bads\b|publicidade|ranquea|palavra[- ]chave|visita)/ },
  { tipo: 'catalogo', re: /(catalogo|cadastr|\bean\b|\bsku\b|variac|\bkit\b|portfolio|mix de produto|ficha tecnica)/ },
  { tipo: 'conta', re: /(reputac|atendimento|cancelament|reclamac|medalha|resposta|\bconta\b)/ },
];

export function inferTipoTask(texto: string): TaskTipo {
  const t = normalizarTexto(texto);
  for (const { tipo, re } of REGRAS) if (re.test(t)) return tipo;
  return 'outro';
}

export function tituloFromItem(texto: string): string {
  return texto.trim().slice(0, 140);
}

export function itemToTaskInput(input: { fonte: FonteAnalise; texto: string; reportId: string }): {
  titulo: string;
  descricao: string;
  tipo: TaskTipo;
  prioridade: TaskPrioridade;
  criadoPor: 'ia';
  reportId: string;
} {
  return {
    titulo: tituloFromItem(input.texto),
    descricao: `${input.texto.trim()}\n\n_Origem: análise IA do relatório._`,
    tipo: inferTipoTask(input.texto),
    prioridade: PRIORIDADE_POR_FONTE[input.fonte],
    criadoPor: 'ia',
    reportId: input.reportId,
  };
}

/**
 * Conversão achado estruturado → task: usa o título direto (sem heurística de
 * slice), o tipo e a prioridade que a própria IA atribuiu, e transforma os
 * passos de `comoFazer` em um checklist markdown. Impacto e SKUs entram na
 * descrição só quando presentes.
 */
export function achadoToTaskInput(
  achado: Achado,
  reportId: string,
): { titulo: string; descricao: string; tipo: TaskTipo; prioridade: TaskPrioridade; criadoPor: 'ia'; reportId: string } {
  const linhas: string[] = [achado.descricao.trim()];
  if (achado.impactoEstimadoMensalBRL !== null) {
    linhas.push(`Impacto estimado: ${formatBRL(achado.impactoEstimadoMensalBRL)}/mês`);
  }
  if (achado.skus.length > 0) linhas.push(`SKUs: ${achado.skus.join(', ')}`);
  linhas.push('', '_Origem: análise IA do relatório._');
  if (achado.comoFazer.length > 0) {
    linhas.push(...achado.comoFazer.map((p) => `${CHECKLIST_UNCHECKED}${p}`));
  }
  return {
    titulo: tituloFromItem(achado.titulo),
    descricao: linhas.join('\n'),
    tipo: achado.tipo,
    prioridade: achado.prioridade,
    criadoPor: 'ia',
    reportId,
  };
}
