import { describe, expect, it } from 'vitest';

import { deveGerarAutomaticamente, type OrgElegibilidade } from '@/modules/scheduler/scheduler.service';

const agora = new Date('2026-07-03T12:00:00Z');

const casos: { nome: string; org: OrgElegibilidade; esperado: boolean }[] = [
  {
    nome: 'elegível com ciclo vencido',
    org: {
      status: 'active',
      plano: 'monthly',
      geracao_automatica: true,
      proximo_relatorio_liberado_em: new Date('2026-07-01T00:00:00Z'),
      erpConectado: true,
    },
    esperado: true,
  },
  {
    nome: 'elegível nunca liberado (null)',
    org: {
      status: 'active',
      plano: 'weekly',
      geracao_automatica: true,
      proximo_relatorio_liberado_em: null,
      erpConectado: true,
    },
    esperado: true,
  },
  {
    nome: 'ciclo ainda não venceu',
    org: {
      status: 'active',
      plano: 'monthly',
      geracao_automatica: true,
      proximo_relatorio_liberado_em: new Date('2026-07-10T00:00:00Z'),
      erpConectado: true,
    },
    esperado: false,
  },
  {
    nome: 'geração automática desligada',
    org: {
      status: 'active',
      plano: 'monthly',
      geracao_automatica: false,
      proximo_relatorio_liberado_em: null,
      erpConectado: true,
    },
    esperado: false,
  },
  {
    nome: 'org suspensa',
    org: {
      status: 'suspended',
      plano: 'monthly',
      geracao_automatica: true,
      proximo_relatorio_liberado_em: null,
      erpConectado: true,
    },
    esperado: false,
  },
  {
    nome: 'sem plano',
    org: {
      status: 'active',
      plano: null,
      geracao_automatica: true,
      proximo_relatorio_liberado_em: null,
      erpConectado: true,
    },
    esperado: false,
  },
  {
    nome: 'ERP desconectado',
    org: {
      status: 'active',
      plano: 'monthly',
      geracao_automatica: true,
      proximo_relatorio_liberado_em: null,
      erpConectado: false,
    },
    esperado: false,
  },
];

describe('deveGerarAutomaticamente', () => {
  it.each(casos)('$nome → $esperado', ({ org, esperado }) => {
    expect(deveGerarAutomaticamente(org, agora)).toBe(esperado);
  });
});
