import { describe, expect, it } from 'vitest';

import { kpisDaCarteira, type OrgResumo } from '@/modules/analista/carteira-data.repository';
import type { RiscoOrg } from '@/modules/analista/score-risco';

const risco = (nivel: RiscoOrg['nivel'], motivos: string[] = []): RiscoOrg => ({
  score: nivel === 'ok' ? 0 : nivel === 'atencao' ? 30 : 60,
  nivel,
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
  risco: risco('ok'),
  ...over,
});

describe('kpisDaCarteira — pura, sem I/O', () => {
  it('soma faturamento/tasks da carteira e calcula variação % (3 orgs, uma ok excluída de orgsEmRisco)', () => {
    const resumos: OrgResumo[] = [
      org({
        orgId: 'a',
        faturamentoMes: 1000,
        faturamentoMesAnterior: 800,
        tasksAbertas: 5,
        tasksAtrasadas: 2,
        pendentesRevisao: 1,
        risco: risco('atencao', ['Conexão Bling expirada']),
      }),
      org({
        orgId: 'b',
        faturamentoMes: 500,
        faturamentoMesAnterior: 500,
        tasksAbertas: 2,
        tasksAtrasadas: 0,
        pendentesRevisao: 0,
        risco: risco('ok'),
      }),
      org({
        orgId: 'c',
        faturamentoMes: 0,
        faturamentoMesAnterior: 0,
        tasksAbertas: 0,
        tasksAtrasadas: 1,
        pendentesRevisao: 2,
        risco: risco('critico', ['Último relatório falhou', '1 tarefa atrasada']),
      }),
    ];

    const kpis = kpisDaCarteira(resumos);

    expect(kpis.totalOrgs).toBe(3);
    expect(kpis.faturamentoMes).toBe(1500); // 1000 + 500 + 0
    expect(kpis.faturamentoMesAnterior).toBe(1300); // 800 + 500 + 0
    // deltaNumero(1500, 1300): (1500-1300)/1300 * 100 = 15.384... → 1 casa = 15.4
    expect(kpis.variacaoFaturamentoPct).toBe(15.4);
    expect(kpis.tasksAbertas).toBe(7); // 5 + 2 + 0
    expect(kpis.tasksAtrasadas).toBe(3); // 2 + 0 + 1
    expect(kpis.pendentesRevisao).toBe(3); // 1 + 0 + 2
    expect(kpis.orgsEmRisco).toBe(2); // 'a' (atencao) + 'c' (critico); 'b' (ok) não conta
  });

  it('faturamentoMesAnterior total = 0 → variacaoFaturamentoPct null (guarda de divisão por zero de deltaNumero)', () => {
    const resumos: OrgResumo[] = [
      org({ orgId: 'a', faturamentoMes: 300, faturamentoMesAnterior: 0 }),
      org({ orgId: 'b', faturamentoMes: 0, faturamentoMesAnterior: 0 }),
    ];

    const kpis = kpisDaCarteira(resumos);

    expect(kpis.faturamentoMes).toBe(300);
    expect(kpis.faturamentoMesAnterior).toBe(0);
    expect(kpis.variacaoFaturamentoPct).toBeNull();
  });

  it('carteira vazia → todos os agregados zerados, variação null, sem I/O', () => {
    const kpis = kpisDaCarteira([]);

    expect(kpis).toEqual({
      totalOrgs: 0,
      faturamentoMes: 0,
      faturamentoMesAnterior: 0,
      variacaoFaturamentoPct: null,
      tasksAbertas: 0,
      tasksAtrasadas: 0,
      pendentesRevisao: 0,
      orgsEmRisco: 0,
    });
  });
});
