/** View-model puro da UI do calendário comercial — normaliza o payload jsonb com defaults seguros. */
import type { CalendarSuggestionRecord } from '@/db/schema';
import type { DataComercial } from '@/lib/calendario-comercial';

const DIA_MS = 86_400_000;

export type SugestaoView = {
  id: string;
  titulo: string;
  dataISO: string;
  nomeData: string;
  sugestao: string;
  skus: string[];
  status: string;
};

export function sugestaoView(r: CalendarSuggestionRecord): SugestaoView {
  const p = (r.payload ?? {}) as {
    dataISO?: unknown;
    nomeData?: unknown;
    sugestao?: unknown;
    skus?: unknown[];
  };
  return {
    id: r.id,
    titulo: r.titulo,
    dataISO: typeof p.dataISO === 'string' ? p.dataISO : '',
    nomeData: typeof p.nomeData === 'string' ? p.nomeData : '',
    sugestao: typeof p.sugestao === 'string' ? p.sugestao : '',
    skus: Array.isArray(p.skus) ? p.skus.map((s) => String(s)) : [],
    status: r.status,
  };
}

export type TimelineEntry = {
  nome: string;
  dataISO: string;
  dica: string;
  faltamDias: number;
  sugestoes: SugestaoView[];
};

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Normaliza um instante qualquer para meia-noite UTC do mesmo dia. Usar
 * SEMPRE como "hoje" antes de passar para proximasDatas/agruparPorData —
 * as datas comerciais são UTC-midnight, e comparar contra `new Date()` (um
 * instante com hora local) faz a data de HOJE cair fora do filtro
 * `>= aPartirDe` assim que o relógio passa da meia-noite UTC.
 */
export function inicioDoDiaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Timeline dos próximos N dias: TODAS as datas comerciais aparecem (mesmo
 * sem nenhuma sugestão casada — a dica geral do calendário já tem valor
 * sozinha). Sugestões casam por dataISO; faltamDias é a diferença em dias
 * de meia-noite UTC a meia-noite UTC (mesma convenção de calendario-comercial.ts).
 */
export function agruparPorData(
  sugestoes: SugestaoView[],
  datas: DataComercial[],
  hoje: Date,
): TimelineEntry[] {
  const hojeMs = utcMidnight(hoje);
  return datas.map((d) => {
    const dataISO = d.data.toISOString().slice(0, 10);
    return {
      nome: d.nome,
      dataISO,
      dica: d.dica,
      faltamDias: Math.round((utcMidnight(d.data) - hojeMs) / DIA_MS),
      sugestoes: sugestoes.filter((s) => s.dataISO === dataISO),
    };
  });
}

export function labelContagem(faltamDias: number): string {
  if (faltamDias === 0) return 'é hoje!';
  if (faltamDias === 1) return 'amanhã';
  return `faltam ${faltamDias} dias`;
}

/**
 * Mapeia a contagem regressiva → variant do Badge (mesmo padrão de
 * badgeDoEstado em src/modules/estoque/estoque-view-model.ts). Limiares
 * espelham a antecedência recomendada pelas próprias dicas do calendário
 * (2-3 semanas para preparar/anunciar): <=7 dias já é "correndo contra o
 * tempo", <=21 dias é a janela ideal de ação, além disso ainda dá tempo.
 */
export function badgeContagem(
  faltamDias: number,
): { variant: 'success' | 'warn' | 'danger' | 'neutral'; label: string } {
  const label = labelContagem(faltamDias);
  if (faltamDias <= 7) return { variant: 'danger', label };
  if (faltamDias <= 21) return { variant: 'warn', label };
  return { variant: 'success', label };
}

export function statusSugestaoBadge(
  status: string,
): { variant: 'success' | 'neutral'; label: string } {
  if (status === 'sugerido') return { variant: 'success', label: 'Sugerido' };
  if (status === 'virou_task') return { variant: 'neutral', label: 'Virou tarefa' };
  return { variant: 'neutral', label: 'Descartado' };
}
