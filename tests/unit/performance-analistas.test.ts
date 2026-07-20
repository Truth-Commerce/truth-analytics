import { describe, expect, it } from 'vitest';

import {
  CLIENTE_EM_RISCO_SCORE_MINIMO,
  performancePorAnalista,
  type AnalistaBase,
  type TaskImpactoAnalista,
} from '@/modules/admin/performance-analistas';
import type { OrgResumo } from '@/modules/analista/carteira-data.repository';
import type { RiscoOrg } from '@/modules/analista/score-risco';

const risco = (score: number, motivos: string[] = []): RiscoOrg => ({
  score,
  nivel: score >= 50 ? 'critico' : score >= 25 ? 'atencao' : 'ok',
  motivos,
});

const org = (over: Partial<OrgResumo>): OrgResumo => ({
  orgId: 'org-x',
  orgName: 'Org X',
  nicho: null,
  faturamentoMes: 0,
  faturamentoMesAnterior: 0,
  tasksAbertas: 0,
  tasksAtrasadas: 0,
  pendentesRevisao: 0,
  risco: risco(0),
  ...over,
});

const analistas: AnalistaBase[] = [
  { analistaId: 'an-1', email: 'ana@example.com' },
  { analistaId: 'an-2', email: 'bruno@example.com' },
];

describe('performancePorAnalista — pura, sem I/O', () => {
  it('agrega nOrgs/faturamento/SLA/clientesEmRisco por analista a partir de OrgResumo[] + map orgId->analistaId', () => {
    const resumos: OrgResumo[] = [
      org({
        orgId: 'org-a1',
        orgName: 'Org A1',
        faturamentoMes: 1000,
        tasksAbertas: 4,
        tasksAtrasadas: 1,
        risco: risco(60), // >= 50 → em risco
      }),
      org({
        orgId: 'org-a2',
        orgName: 'Org A2',
        faturamentoMes: 500,
        tasksAbertas: 2,
        tasksAtrasadas: 0,
        risco: risco(10),
      }),
      org({
        orgId: 'org-b1',
        orgName: 'Org B1',
        faturamentoMes: 300,
        tasksAbertas: 0,
        tasksAtrasadas: 0,
        risco: risco(0),
      }),
    ];
    const analistaPorOrg = new Map<string, string>([
      ['org-a1', 'an-1'],
      ['org-a2', 'an-1'],
      ['org-b1', 'an-2'],
    ]);
    const concluidas30dPorAnalista = new Map<string, number>([
      ['an-1', 7],
      ['an-2', 2],
    ]);
    const impactos: TaskImpactoAnalista[] = [];

    const linhas = performancePorAnalista({
      analistas,
      resumos,
      analistaPorOrg,
      concluidas30dPorAnalista,
      impactos,
    });

    expect(linhas).toHaveLength(2);
    const an1 = linhas.find((l) => l.analistaId === 'an-1')!;
    expect(an1.email).toBe('ana@example.com');
    expect(an1.nOrgs).toBe(2);
    expect(an1.faturamentoCarteira).toBe(1500); // 1000 + 500
    expect(an1.tasksConcluidas30d).toBe(7);
    expect(an1.clientesEmRisco).toBe(1); // só org-a1 (score 60 >= 50)
    // SLA: tasksAbertas totais = 6, atrasadas totais = 1 → (6-1)/6*100 = 83.3
    expect(an1.slaPct).toBe(83.3);

    const an2 = linhas.find((l) => l.analistaId === 'an-2')!;
    expect(an2.nOrgs).toBe(1);
    expect(an2.faturamentoCarteira).toBe(300);
    expect(an2.clientesEmRisco).toBe(0);
    // tasksAbertas = 0 → sem base p/ medir SLA
    expect(an2.slaPct).toBeNull();
  });

  it('org sem analista atribuído (fora do map) é excluída de qualquer linha — não vira "sem analista"', () => {
    const resumos: OrgResumo[] = [
      org({ orgId: 'org-orfa', faturamentoMes: 999, risco: risco(80) }),
      org({ orgId: 'org-a1', faturamentoMes: 100 }),
    ];
    const analistaPorOrg = new Map<string, string>([['org-a1', 'an-1']]); // org-orfa não entra no map
    const linhas = performancePorAnalista({
      analistas: [{ analistaId: 'an-1', email: 'ana@example.com' }],
      resumos,
      analistaPorOrg,
      concluidas30dPorAnalista: new Map(),
      impactos: [],
    });

    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.nOrgs).toBe(1);
    expect(linhas[0]!.faturamentoCarteira).toBe(100); // não soma os 999 da org órfã
  });

  it('analista com ZERO orgs atribuídas ainda aparece na tabela (zerado)', () => {
    const linhas = performancePorAnalista({
      analistas: [{ analistaId: 'an-vazio', email: 'vazio@example.com' }],
      resumos: [],
      analistaPorOrg: new Map(),
      concluidas30dPorAnalista: new Map(),
      impactos: [],
    });

    expect(linhas).toEqual([
      {
        analistaId: 'an-vazio',
        email: 'vazio@example.com',
        nOrgs: 0,
        faturamentoCarteira: 0,
        tasksConcluidas30d: 0,
        impactoPositivoAgregado: 0,
        slaPct: null,
        clientesEmRisco: 0,
      },
    ]);
  });

  it('clientesEmRisco usa o limiar CLIENTE_EM_RISCO_SCORE_MINIMO (score exatamente 50 conta; 49 não)', () => {
    expect(CLIENTE_EM_RISCO_SCORE_MINIMO).toBe(50);
    const resumos: OrgResumo[] = [
      org({ orgId: 'org-49', risco: risco(49) }),
      org({ orgId: 'org-50', risco: risco(50) }),
    ];
    const analistaPorOrg = new Map([
      ['org-49', 'an-1'],
      ['org-50', 'an-1'],
    ]);
    const linhas = performancePorAnalista({
      analistas: [{ analistaId: 'an-1', email: 'ana@example.com' }],
      resumos,
      analistaPorOrg,
      concluidas30dPorAnalista: new Map(),
      impactos: [],
    });
    expect(linhas[0]!.clientesEmRisco).toBe(1);
  });

  it('SLA 100% quando nenhuma tarefa aberta está atrasada; 0% quando todas atrasadas', () => {
    const resumosTodasNoPrazo: OrgResumo[] = [org({ orgId: 'o1', tasksAbertas: 5, tasksAtrasadas: 0 })];
    const resumosTodasAtrasadas: OrgResumo[] = [org({ orgId: 'o1', tasksAbertas: 5, tasksAtrasadas: 5 })];
    const analistaPorOrg = new Map([['o1', 'an-1']]);
    const base = { analistas: [{ analistaId: 'an-1', email: 'x@example.com' }], analistaPorOrg, concluidas30dPorAnalista: new Map(), impactos: [] };

    expect(performancePorAnalista({ ...base, resumos: resumosTodasNoPrazo })[0]!.slaPct).toBe(100);
    expect(performancePorAnalista({ ...base, resumos: resumosTodasAtrasadas })[0]!.slaPct).toBe(0);
  });

  it('impactoPositivoAgregado: média do deltaPct só das entradas POSITIVAS (>0), arredondada em 1 casa; 0 sem entradas', () => {
    const analistaPorOrg = new Map([['o1', 'an-1']]);
    const base = {
      analistas: [{ analistaId: 'an-1', email: 'x@example.com' }],
      resumos: [org({ orgId: 'o1' })],
      analistaPorOrg,
      concluidas30dPorAnalista: new Map(),
    };

    // sem nenhum impacto medido
    expect(performancePorAnalista({ ...base, impactos: [] })[0]!.impactoPositivoAgregado).toBe(0);

    // 2 positivos (10, 20) e 1 negativo (-50, ignorado) → média (10+20)/2 = 15
    const impactos: TaskImpactoAnalista[] = [
      { analistaId: 'an-1', deltaPct: 10 },
      { analistaId: 'an-1', deltaPct: 20 },
      { analistaId: 'an-1', deltaPct: -50 },
    ];
    expect(performancePorAnalista({ ...base, impactos })[0]!.impactoPositivoAgregado).toBe(15);

    // arredondamento em 1 casa: (10+11)/2 = 10.5
    const impactosFrac: TaskImpactoAnalista[] = [
      { analistaId: 'an-1', deltaPct: 10 },
      { analistaId: 'an-1', deltaPct: 11 },
    ];
    expect(performancePorAnalista({ ...base, impactos: impactosFrac })[0]!.impactoPositivoAgregado).toBe(10.5);

    // impacto de outro analista não vaza pra este
    const impactosOutro: TaskImpactoAnalista[] = [{ analistaId: 'an-2', deltaPct: 99 }];
    expect(performancePorAnalista({ ...base, impactos: impactosOutro })[0]!.impactoPositivoAgregado).toBe(0);
  });

  it('ordena por faturamentoCarteira desc, empate por email asc pt-BR', () => {
    const analistasTres: AnalistaBase[] = [
      { analistaId: 'an-baixo', email: 'baixo@example.com' },
      { analistaId: 'an-alto', email: 'alto@example.com' },
      { analistaId: 'an-empate-z', email: 'zeta@example.com' },
      { analistaId: 'an-empate-a', email: 'álvaro@example.com' },
    ];
    const resumos: OrgResumo[] = [
      org({ orgId: 'o-baixo', faturamentoMes: 100 }),
      org({ orgId: 'o-alto', faturamentoMes: 900 }),
      org({ orgId: 'o-emp-z', faturamentoMes: 500 }),
      org({ orgId: 'o-emp-a', faturamentoMes: 500 }),
    ];
    const analistaPorOrg = new Map([
      ['o-baixo', 'an-baixo'],
      ['o-alto', 'an-alto'],
      ['o-emp-z', 'an-empate-z'],
      ['o-emp-a', 'an-empate-a'],
    ]);

    const linhas = performancePorAnalista({
      analistas: analistasTres,
      resumos,
      analistaPorOrg,
      concluidas30dPorAnalista: new Map(),
      impactos: [],
    });

    expect(linhas.map((l) => l.analistaId)).toEqual(['an-alto', 'an-empate-a', 'an-empate-z', 'an-baixo']);
  });

  it('sem analistas e sem resumos → lista vazia', () => {
    expect(
      performancePorAnalista({
        analistas: [],
        resumos: [],
        analistaPorOrg: new Map(),
        concluidas30dPorAnalista: new Map(),
        impactos: [],
      }),
    ).toEqual([]);
  });
});
