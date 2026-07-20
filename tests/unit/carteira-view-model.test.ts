import { describe, expect, it } from 'vitest';

import type { OrgResumo } from '@/modules/analista/carteira-data.repository';
import {
  badgeDoNivel,
  filaAtencaoHoje,
  motivoEhConexao,
  ordenarPorRisco,
  orgsQuePrecisamAtencao,
  top3Motivos,
} from '@/modules/analista/carteira-view-model';
import type { RiscoOrg } from '@/modules/analista/score-risco';

const risco = (score: number, nivel: RiscoOrg['nivel'], motivos: string[] = []): RiscoOrg => ({
  score,
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
  risco: risco(0, 'ok'),
  ...over,
});

describe('ordenarPorRisco — pura, sem I/O', () => {
  it('ordena por risco.score desc', () => {
    const resumos = [
      org({ orgId: 'a', orgName: 'Alfa', risco: risco(10, 'ok') }),
      org({ orgId: 'b', orgName: 'Beta', risco: risco(60, 'critico') }),
      org({ orgId: 'c', orgName: 'Gama', risco: risco(30, 'atencao') }),
    ];

    expect(ordenarPorRisco(resumos).map((r) => r.orgId)).toEqual(['b', 'c', 'a']);
  });

  it('empate de score → desempate por orgName asc (pt-BR, com acentos)', () => {
    const resumos = [
      org({ orgId: 'z', orgName: 'Établo', risco: risco(20, 'ok') }),
      org({ orgId: 'y', orgName: 'Azul', risco: risco(20, 'ok') }),
      org({ orgId: 'x', orgName: 'Éter', risco: risco(20, 'ok') }),
    ];

    expect(ordenarPorRisco(resumos).map((r) => r.orgId)).toEqual(['y', 'z', 'x']);
  });

  it('não muta o array original (retorna cópia)', () => {
    const resumos = [org({ orgId: 'a', risco: risco(10, 'ok') }), org({ orgId: 'b', risco: risco(60, 'critico') })];
    const original = [...resumos];

    ordenarPorRisco(resumos);

    expect(resumos).toEqual(original);
  });
});

describe('orgsQuePrecisamAtencao — pura', () => {
  it('exclui orgs com nivel "ok" e mantém ordem por score desc entre as demais', () => {
    const resumos = [
      org({ orgId: 'a', orgName: 'Alfa', risco: risco(10, 'ok') }),
      org({ orgId: 'b', orgName: 'Beta', risco: risco(60, 'critico') }),
      org({ orgId: 'c', orgName: 'Gama', risco: risco(30, 'atencao') }),
      org({ orgId: 'd', orgName: 'Delta', risco: risco(90, 'ok') }),
    ];

    expect(orgsQuePrecisamAtencao(resumos).map((r) => r.orgId)).toEqual(['b', 'c']);
  });

  it('carteira toda "ok" → []', () => {
    const resumos = [
      org({ orgId: 'a', risco: risco(10, 'ok') }),
      org({ orgId: 'b', risco: risco(90, 'ok') }),
    ];

    expect(orgsQuePrecisamAtencao(resumos)).toEqual([]);
  });

  it('carteira vazia → []', () => {
    expect(orgsQuePrecisamAtencao([])).toEqual([]);
  });
});

describe('top3Motivos — pura', () => {
  it('corta para os 3 primeiros (motivos já vêm ordenados por peso desc)', () => {
    expect(top3Motivos(['m1', 'm2', 'm3', 'm4', 'm5'])).toEqual(['m1', 'm2', 'm3']);
  });

  it('lista com menos de 3 motivos volta intacta', () => {
    expect(top3Motivos(['m1'])).toEqual(['m1']);
    expect(top3Motivos([])).toEqual([]);
  });
});

describe('badgeDoNivel — pura', () => {
  it('mapeia nivel → variant real do Badge + rótulo pt-BR', () => {
    expect(badgeDoNivel('critico')).toEqual({ variant: 'danger', label: 'Crítico' });
    expect(badgeDoNivel('atencao')).toEqual({ variant: 'warn', label: 'Atenção' });
    expect(badgeDoNivel('ok')).toEqual({ variant: 'success', label: 'Ok' });
  });
});

describe('motivoEhConexao — pura', () => {
  it('reconhece os 3 motivos de conexão produzidos por calcularRisco', () => {
    expect(motivoEhConexao('Conexão Bling expirada')).toBe(true);
    expect(motivoEhConexao('Conexão Bling expirando em breve')).toBe(true);
    expect(motivoEhConexao('Erro na conexão Bling')).toBe(false);
  });

  it('não reconhece motivos não relacionados a conexão', () => {
    expect(motivoEhConexao('Último relatório falhou')).toBe(false);
    expect(motivoEhConexao('3 tarefas atrasadas')).toBe(false);
    expect(motivoEhConexao('Meta em risco')).toBe(false);
  });
});

describe('filaAtencaoHoje — pura, integra ordenação + top-3 + flag de conexão', () => {
  it('monta a fila ordenada por score desc, com top-3 motivos e flag de conexão', () => {
    const resumos: OrgResumo[] = [
      org({
        orgId: 'a',
        orgName: 'Org A',
        risco: risco(10, 'ok', ['1 tarefa atrasada']),
      }),
      org({
        orgId: 'b',
        orgName: 'Org B',
        risco: risco(60, 'critico', [
          'Conexão Bling expirada',
          'Último relatório falhou',
          'Queda nas vendas',
          '2 tarefas atrasadas',
        ]),
      }),
      org({
        orgId: 'c',
        orgName: 'Org C',
        risco: risco(30, 'atencao', ['Meta em risco']),
      }),
    ];

    const fila = filaAtencaoHoje(resumos);

    // Org A é 'ok' — não entra na fila "Atenção hoje".
    expect(fila.map((r) => r.orgId)).toEqual(['b', 'c']);

    expect(fila[0]).toEqual({
      orgId: 'b',
      orgName: 'Org B',
      nicho: null,
      score: 60,
      nivel: 'critico',
      motivosTop3: ['Conexão Bling expirada', 'Último relatório falhou', 'Queda nas vendas'],
      mostrarLinkConexoes: true,
    });

    expect(fila[1].mostrarLinkConexoes).toBe(false);
    expect(fila[1].motivosTop3).toEqual(['Meta em risco']);
  });

  it('exclui orgs com nivel "ok" mesmo quando têm o maior score', () => {
    const resumos: OrgResumo[] = [
      org({ orgId: 'a', orgName: 'Org A', risco: risco(95, 'ok', ['Meta em risco']) }),
      org({ orgId: 'b', orgName: 'Org B', risco: risco(30, 'atencao', ['Meta em risco']) }),
    ];

    expect(filaAtencaoHoje(resumos).map((r) => r.orgId)).toEqual(['b']);
  });

  it('carteira toda "ok" → fila vazia', () => {
    const resumos: OrgResumo[] = [
      org({ orgId: 'a', risco: risco(10, 'ok') }),
      org({ orgId: 'b', risco: risco(90, 'ok') }),
    ];

    expect(filaAtencaoHoje(resumos)).toEqual([]);
  });

  it('carteira vazia → fila vazia', () => {
    expect(filaAtencaoHoje([])).toEqual([]);
  });
});
