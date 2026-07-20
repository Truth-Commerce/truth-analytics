import { describe, expect, it } from 'vitest';

import {
  agruparPorNicho,
  contarPorQuadrante,
  quadrantesCarteira,
  rankearCanaisCarteira,
  sugestoesReplicaveis,
  type TaskReplicavel,
} from '@/modules/analista/comparativo';
import type { OrgResumo } from '@/modules/analista/carteira-data.repository';
import type { RiscoOrg } from '@/modules/analista/score-risco';

const riscoOk: RiscoOrg = { score: 0, nivel: 'ok', motivos: [] };

const org = (over: Partial<OrgResumo>): OrgResumo => ({
  orgId: 'org-x',
  orgName: 'Org X',
  nicho: null,
  faturamentoMes: 0,
  faturamentoMesAnterior: 0,
  tasksAbertas: 0,
  tasksAtrasadas: 0,
  pendentesRevisao: 0,
  risco: riscoOk,
  ...over,
});

describe('quadrantesCarteira — pura, sem I/O', () => {
  it('4 orgs distintas caem nos 4 quadrantes (crescimento vs 0%, volume vs mediana da carteira)', () => {
    // Mediana de [3000, 2000, 1000, 500] = (1000+2000)/2 = 1500 → volume "alto" >= 1500.
    const resumos: OrgResumo[] = [
      org({ orgId: 'estrela', orgName: 'Estrela', faturamentoMes: 3000, faturamentoMesAnterior: 2000 }), // +50%, volume alto
      org({ orgId: 'crescendo', orgName: 'Crescendo', faturamentoMes: 1000, faturamentoMesAnterior: 500 }), // +100%, volume baixo
      org({ orgId: 'estavel', orgName: 'Estável', faturamentoMes: 2000, faturamentoMesAnterior: 2500 }), // -20%, volume alto
      org({ orgId: 'atencao', orgName: 'Atenção', faturamentoMes: 500, faturamentoMesAnterior: 800 }), // -37,5%, volume baixo
    ];

    const quadrantes = quadrantesCarteira(resumos);
    const porId = new Map(quadrantes.map((q) => [q.orgId, q]));

    expect(porId.get('estrela')!.quadrante).toBe('Estrelas');
    expect(porId.get('crescendo')!.quadrante).toBe('Crescendo');
    expect(porId.get('estavel')!.quadrante).toBe('Estáveis');
    expect(porId.get('atencao')!.quadrante).toBe('Atenção');
  });

  it('fronteira de crescimento: exatamente 0% entra em "crescendo" (inclusivo)', () => {
    const resumos: OrgResumo[] = [
      org({ orgId: 'zero-alto', faturamentoMes: 2000, faturamentoMesAnterior: 2000 }), // 0%, será volume alto (única org de maior valor)
      org({ orgId: 'baixo', faturamentoMes: 100, faturamentoMesAnterior: 100 }), // 0%, volume baixo
    ];
    const quadrantes = quadrantesCarteira(resumos);
    const zeroAlto = quadrantes.find((q) => q.orgId === 'zero-alto')!;
    expect(zeroAlto.crescimentoPct).toBe(0);
    expect(zeroAlto.quadrante).toBe('Estrelas'); // crescimento >=0 e volume alto
  });

  it('fronteira de volume: org exatamente na mediana entra em "alto" (inclusivo)', () => {
    // 3 orgs -> mediana é o valor do meio (1000).
    const resumos: OrgResumo[] = [
      org({ orgId: 'topo', faturamentoMes: 2000, faturamentoMesAnterior: 2000 }),
      org({ orgId: 'meio', faturamentoMes: 1000, faturamentoMesAnterior: 1000 }),
      org({ orgId: 'base', faturamentoMes: 100, faturamentoMesAnterior: 100 }),
    ];
    const quadrantes = quadrantesCarteira(resumos);
    const meio = quadrantes.find((q) => q.orgId === 'meio')!;
    // crescimento 0% (inclusivo, "crescendo") + volume == mediana (inclusivo, "alto") → Estrelas.
    expect(meio.quadrante).toBe('Estrelas');
  });

  it('sem faturamento anterior e sem faturamento atual (0/0) → sem sinal de crescimento, cai em "caindo"', () => {
    const resumos: OrgResumo[] = [
      org({ orgId: 'vazia', faturamentoMes: 0, faturamentoMesAnterior: 0 }),
      org({ orgId: 'com-volume', faturamentoMes: 1000, faturamentoMesAnterior: 1000 }),
    ];
    const quadrantes = quadrantesCarteira(resumos);
    const vazia = quadrantes.find((q) => q.orgId === 'vazia')!;
    expect(vazia.crescimentoPct).toBeNull();
    expect(vazia.quadrante).toBe('Atenção'); // sem crescimento e volume baixo (0 < mediana)
  });

  it('faturamento anterior 0 e atual > 0 → crescimento "do zero" tratado como crescendo', () => {
    const resumos: OrgResumo[] = [
      org({ orgId: 'novo', faturamentoMes: 100, faturamentoMesAnterior: 0 }),
      org({ orgId: 'outra', faturamentoMes: 5000, faturamentoMesAnterior: 5000 }),
    ];
    const quadrantes = quadrantesCarteira(resumos);
    const novo = quadrantes.find((q) => q.orgId === 'novo')!;
    expect(novo.crescimentoPct).toBeNull();
    expect(novo.quadrante).toBe('Crescendo'); // crescendo (do zero) mas volume baixo
  });

  it('carteira vazia → array vazio, sem lançar', () => {
    expect(quadrantesCarteira([])).toEqual([]);
  });
});

describe('contarPorQuadrante — pura, sem I/O', () => {
  it('conta orgs por quadrante, incluindo os que ficaram em 0', () => {
    const quadrantes = quadrantesCarteira([
      org({ orgId: 'a', faturamentoMes: 2000, faturamentoMesAnterior: 1000 }), // Estrelas (crescendo + único = mediana = alto)
      org({ orgId: 'b', faturamentoMes: 100, faturamentoMesAnterior: 50 }), // Crescendo (crescendo + baixo, mediana entre os 2)
    ]);
    const contagem = contarPorQuadrante(quadrantes);
    expect(contagem.Estrelas).toBe(1);
    expect(contagem.Crescendo).toBe(1);
    expect(contagem.Estáveis).toBe(0);
    expect(contagem.Atenção).toBe(0);
  });

  it('lista vazia → todas as 4 chaves em 0', () => {
    expect(contarPorQuadrante([])).toEqual({ Estrelas: 0, Crescendo: 0, Estáveis: 0, Atenção: 0 });
  });
});

describe('agruparPorNicho — pura, sem I/O', () => {
  it('agrupa por nicho: contagem + faturamento médio', () => {
    const resumos: OrgResumo[] = [
      org({ orgId: 'a', nicho: 'moda', faturamentoMes: 1000 }),
      org({ orgId: 'b', nicho: 'moda', faturamentoMes: 2000 }),
      org({ orgId: 'c', nicho: 'casa', faturamentoMes: 300 }),
    ];
    const grupos = agruparPorNicho(resumos);
    const moda = grupos.find((g) => g.nicho === 'moda')!;
    const casa = grupos.find((g) => g.nicho === 'casa')!;

    expect(moda.quantidade).toBe(2);
    expect(moda.faturamentoMedio).toBe(1500); // (1000+2000)/2
    expect(casa.quantidade).toBe(1);
    expect(casa.faturamentoMedio).toBe(300);
  });

  it('nicho null vira o grupo "sem nicho"', () => {
    const resumos: OrgResumo[] = [
      org({ orgId: 'a', nicho: null, faturamentoMes: 500 }),
      org({ orgId: 'b', nicho: null, faturamentoMes: 1500 }),
    ];
    const grupos = agruparPorNicho(resumos);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.nicho).toBe('sem nicho');
    expect(grupos[0]!.quantidade).toBe(2);
    expect(grupos[0]!.faturamentoMedio).toBe(1000);
  });

  it('ordena por quantidade desc; empate por nome do nicho asc', () => {
    const resumos: OrgResumo[] = [
      org({ orgId: 'a', nicho: 'beleza', faturamentoMes: 100 }),
      org({ orgId: 'b', nicho: 'casa', faturamentoMes: 100 }),
      org({ orgId: 'c', nicho: 'moda', faturamentoMes: 100 }),
      org({ orgId: 'd', nicho: 'moda', faturamentoMes: 100 }),
    ];
    const grupos = agruparPorNicho(resumos);
    expect(grupos.map((g) => g.nicho)).toEqual(['moda', 'beleza', 'casa']);
  });

  it('carteira vazia → array vazio', () => {
    expect(agruparPorNicho([])).toEqual([]);
  });
});

describe('rankearCanaisCarteira — pura, sem I/O', () => {
  it('agrega o total por canal (mesmo canal em orgs diferentes soma) e ordena desc', () => {
    const ranking = rankearCanaisCarteira([
      { canal: 'shopee', total: 100 },
      { canal: 'mercado livre', total: 300 },
      { canal: 'shopee', total: 200 },
    ]);
    expect(ranking[0]).toEqual({ canal: 'mercado livre', total: 300, participacaoPct: 50 });
    expect(ranking[1]).toEqual({ canal: 'shopee', total: 300, participacaoPct: 50 });
  });

  it('empate no total desempata por nome do canal asc', () => {
    const ranking = rankearCanaisCarteira([
      { canal: 'shopee', total: 100 },
      { canal: 'mercado livre', total: 100 },
    ]);
    expect(ranking.map((r) => r.canal)).toEqual(['mercado livre', 'shopee']);
  });

  it('lista vazia → array vazio, sem divisão por zero', () => {
    expect(rankearCanaisCarteira([])).toEqual([]);
  });
});

describe('sugestoesReplicaveis — pura, sem I/O', () => {
  const candidato = (over: Partial<TaskReplicavel>): TaskReplicavel => ({
    taskId: 't1',
    orgId: 'org-1',
    orgName: 'Org 1',
    titulo: 'Task',
    tipo: 'catalogo',
    deltaPct: 10,
    ...over,
  });

  it('filtra fora deltaPct <= 0 e ordena por deltaPct desc', () => {
    const out = sugestoesReplicaveis([
      candidato({ taskId: 'a', deltaPct: 10 }),
      candidato({ taskId: 'b', deltaPct: -5 }),
      candidato({ taskId: 'c', deltaPct: 40 }),
      candidato({ taskId: 'd', deltaPct: 0 }),
    ]);
    expect(out.map((t) => t.taskId)).toEqual(['c', 'a']);
  });

  it('lista vazia → array vazio', () => {
    expect(sugestoesReplicaveis([])).toEqual([]);
  });
});
