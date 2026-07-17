/** View-model puro da UI de estoque (testável em node — lógica fora dos RSC). */
import type { CoberturaProduto, EstadoEstoque } from '@/modules/estoque/stock-coverage';

export function resumoEstoque(produtos: CoberturaProduto[]): {
  criticos: number;
  atencao: number;
  parados: number;
} {
  return {
    criticos: produtos.filter((p) => p.estado === 'critico').length,
    atencao: produtos.filter((p) => p.estado === 'atencao').length,
    parados: produtos.filter((p) => p.estado === 'parado').length,
  };
}

export function labelCobertura(p: CoberturaProduto): string {
  if (p.coberturaDias === null) return '—';
  if (p.coberturaDias <= 0) return 'esgotando';
  return `~${p.coberturaDias} dias`;
}

/**
 * Mapeia estado → variant do Badge (src/components/ui/Badge.tsx) + rótulo pt-BR.
 * Badge não exporta seu union type — mesmo padrão de reportStatusVariant
 * (src/modules/reports/report.types.ts): literal union inline com os variants reais.
 */
export function badgeDoEstado(
  estado: EstadoEstoque,
): { variant: 'success' | 'warn' | 'danger' | 'neutral'; label: string } {
  switch (estado) {
    case 'critico':
      return { variant: 'danger', label: 'Crítico' };
    case 'atencao':
      return { variant: 'warn', label: 'Atenção' };
    case 'ok':
      return { variant: 'success', label: 'Ok' };
    case 'parado':
      return { variant: 'neutral', label: 'Parado' };
  }
}
