import type { TaskPrioridade, TaskTipo } from './task.types';

export const FONTES_ANALISE = ['gargalos', 'sugestoesMelhoria', 'ideiasVenda'] as const;
export type FonteAnalise = (typeof FONTES_ANALISE)[number];

export const PRIORIDADE_POR_FONTE: Record<FonteAnalise, TaskPrioridade> = {
  gargalos: 'alta',
  sugestoesMelhoria: 'media',
  ideiasVenda: 'baixa',
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
