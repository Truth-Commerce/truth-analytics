/** View-model puro da UI de kits — normaliza o payload jsonb com defaults seguros. */
import type { KitSuggestionRecord } from '@/db/schema';

export type KitView = {
  id: string;
  titulo: string;
  itens: { sku: string; nome: string }[];
  precoSugerido: number | null;
  argumento: string;
  canalRecomendado: string;
  pedidosJuntos: number;
  status: string;
};

export function kitView(k: KitSuggestionRecord): KitView {
  const p = (k.payload ?? {}) as {
    itens?: { sku?: unknown; nome?: unknown }[];
    precoSugerido?: unknown;
    argumento?: unknown;
    canalRecomendado?: unknown;
    evidencia?: { pedidosJuntos?: unknown };
  };
  return {
    id: k.id,
    titulo: k.titulo,
    itens: (p.itens ?? []).map((i) => ({ sku: String(i.sku ?? ''), nome: String(i.nome ?? '') })),
    precoSugerido: typeof p.precoSugerido === 'number' ? p.precoSugerido : null,
    argumento: typeof p.argumento === 'string' ? p.argumento : '',
    canalRecomendado: typeof p.canalRecomendado === 'string' ? p.canalRecomendado : '',
    pedidosJuntos:
      typeof p.evidencia?.pedidosJuntos === 'number' ? p.evidencia.pedidosJuntos : 0,
    status: k.status,
  };
}

export function statusKitBadge(status: string): { variant: 'success' | 'neutral'; label: string } {
  if (status === 'sugerido') return { variant: 'success', label: 'Sugerido' };
  if (status === 'virou_task') return { variant: 'neutral', label: 'Virou tarefa' };
  return { variant: 'neutral', label: 'Descartado' };
}
