import { describe, expect, it } from 'vitest';

import type { Achado, AnaliseIa } from '@/modules/pipeline/contracts';
import { ordenarAchados, primeiroGargalo } from '@/modules/reports/report-view-model';

function achado(over: Partial<Achado>): Achado {
  return {
    titulo: 'Achado',
    descricao: 'Descrição.',
    tipo: 'outro',
    prioridade: 'media',
    impactoEstimadoMensalBRL: null,
    comoFazer: [],
    skus: [],
    ...over,
  };
}

describe('ordenarAchados', () => {
  it('impacto desc → null por último → prioridade → título; preserva índice original', () => {
    const lista = [
      achado({ titulo: 'B sem impacto alta', prioridade: 'alta' }), // 0
      achado({ titulo: 'C impacto 500', impactoEstimadoMensalBRL: 500 }), // 1
      achado({ titulo: 'A impacto 2000', impactoEstimadoMensalBRL: 2000 }), // 2
      achado({ titulo: 'A sem impacto alta', prioridade: 'alta' }), // 3
    ];
    const r = ordenarAchados(lista);
    expect(r.map((x) => x.achado.titulo)).toEqual([
      'A impacto 2000',
      'C impacto 500',
      'A sem impacto alta',
      'B sem impacto alta',
    ]);
    expect(r.map((x) => x.indice)).toEqual([2, 1, 3, 0]);
  });
});

describe('primeiroGargalo', () => {
  const base: AnaliseIa = {
    resumoExecutivo: 'R.',
    gargalos: ['Gargalo legado'],
    sugestoesMelhoria: [],
    ideiasVenda: [],
    recomendacoesPreco: [],
  };

  it('prefere o achado de maior impacto quando presente', () => {
    const a: AnaliseIa = { ...base, achados: [achado({ titulo: 'Top', impactoEstimadoMensalBRL: 900 })] };
    expect(primeiroGargalo(a)).toBe('Top');
  });

  it('fallback para gargalos[0] em relatório antigo', () => {
    expect(primeiroGargalo(base)).toBe('Gargalo legado');
  });

  it('null quando não há nada', () => {
    expect(primeiroGargalo({ ...base, gargalos: [] })).toBeNull();
  });
});
