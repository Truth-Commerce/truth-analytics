import { describe, expect, it } from 'vitest';

import { calcularRisco, type InsumosRisco } from '@/modules/analista/score-risco';

const SAUDAVEL: InsumosRisco = {
  conexao: 'ok',
  tokenExpiraEmHoras: null,
  ultimoReportFailed: false,
  diasSemReportDone: null,
  diasDoPlano: 30,
  quedaVendas: false,
  tasksAtrasadas: 0,
  skusEstoqueCritico: 0,
  metaEmRisco: false,
};

describe('calcularRisco', () => {
  it('org saudável → score 0, nivel ok, sem motivos', () => {
    const r = calcularRisco(SAUDAVEL);
    expect(r).toEqual({ score: 0, nivel: 'ok', motivos: [] });
  });

  it('conexão expirada sozinha → 30, atencao, 1 motivo', () => {
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'expirado' });
    expect(r.score).toBe(30);
    expect(r.nivel).toBe('atencao');
    expect(r.motivos).toEqual(['Conexão Bling expirada']);
  });

  it('conexão com erro sozinha → 25', () => {
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'erro' });
    expect(r.score).toBe(25);
    expect(r.nivel).toBe('atencao');
  });

  it('conexão expirando <72h sozinha → 15', () => {
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'ok', tokenExpiraEmHoras: 24 });
    expect(r.score).toBe(15);
    expect(r.nivel).toBe('ok');
  });

  it('token expirando >=72h não conta', () => {
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'ok', tokenExpiraEmHoras: 72 });
    expect(r.score).toBe(0);
  });

  it('só o maior insumo de conexão conta (expirado + tokenExpiraEmHoras não somam)', () => {
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'expirado', tokenExpiraEmHoras: 10 });
    expect(r.score).toBe(30);
    expect(r.motivos).toEqual(['Conexão Bling expirada']);
  });

  it('erro + expirando<72h → conta só o erro (maior peso), não soma', () => {
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'erro', tokenExpiraEmHoras: 10 });
    expect(r.score).toBe(25);
    expect(r.motivos).toEqual(['Erro na conexão Bling']);
  });

  it('conexao nenhuma não pontua (não é um dos 3 estados de risco)', () => {
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'nenhuma' });
    expect(r.score).toBe(0);
  });

  it('conexao nenhuma + tokenExpiraEmHoras<72h não pontua (gate só vale p/ conexao ok)', () => {
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'nenhuma', tokenExpiraEmHoras: 10 });
    expect(r.score).toBe(0);
    expect(r.nivel).toBe('ok');
    expect(r.motivos).toEqual([]);
  });

  it('conexao ok + tokenExpiraEmHoras<72h → 15 (caso real continua disparando)', () => {
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'ok', tokenExpiraEmHoras: 10 });
    expect(r.score).toBe(15);
    expect(r.motivos).toEqual(['Conexão Bling expirando em breve']);
  });

  it('ultimoReportFailed → 25', () => {
    const r = calcularRisco({ ...SAUDAVEL, ultimoReportFailed: true });
    expect(r.score).toBe(25);
    expect(r.motivos).toEqual(['Último relatório falhou']);
  });

  it('diasSemReportDone > diasDoPlano+7 → 20', () => {
    const r = calcularRisco({ ...SAUDAVEL, diasDoPlano: 30, diasSemReportDone: 38 });
    expect(r.score).toBe(20);
  });

  it('diasSemReportDone == diasDoPlano+7 (fronteira) não dispara', () => {
    const r = calcularRisco({ ...SAUDAVEL, diasDoPlano: 30, diasSemReportDone: 37 });
    expect(r.score).toBe(0);
  });

  it('quedaVendas → 20', () => {
    const r = calcularRisco({ ...SAUDAVEL, quedaVendas: true });
    expect(r.score).toBe(20);
    expect(r.motivos).toEqual(['Queda nas vendas']);
  });

  it('tasksAtrasadas×5 sem cap: 2 tasks → 10', () => {
    const r = calcularRisco({ ...SAUDAVEL, tasksAtrasadas: 2 });
    expect(r.score).toBe(10);
    expect(r.motivos).toEqual(['2 tarefas atrasadas']);
  });

  it('tasksAtrasadas cap em 15: 4 tasks → 15 não 20', () => {
    const r = calcularRisco({ ...SAUDAVEL, tasksAtrasadas: 4 });
    expect(r.score).toBe(15);
    expect(r.motivos).toEqual(['4 tarefas atrasadas']);
  });

  it('skusEstoqueCritico×4 sem cap: 2 skus → 8', () => {
    const r = calcularRisco({ ...SAUDAVEL, skusEstoqueCritico: 2 });
    expect(r.score).toBe(8);
    expect(r.motivos).toEqual(['2 SKUs em estoque crítico']);
  });

  it('skusEstoqueCritico cap em 12: 4 skus → 12 não 16', () => {
    const r = calcularRisco({ ...SAUDAVEL, skusEstoqueCritico: 4 });
    expect(r.score).toBe(12);
    expect(r.motivos).toEqual(['4 SKUs em estoque crítico']);
  });

  it('metaEmRisco → 10', () => {
    const r = calcularRisco({ ...SAUDAVEL, metaEmRisco: true });
    expect(r.score).toBe(10);
    expect(r.motivos).toEqual(['Meta em risco']);
  });

  it('combinação estoura cap 100', () => {
    const r = calcularRisco({
      conexao: 'expirado', // 30
      tokenExpiraEmHoras: 10,
      ultimoReportFailed: true, // 25
      diasDoPlano: 30,
      diasSemReportDone: 40, // 20
      quedaVendas: true, // 20
      tasksAtrasadas: 10, // cap 15
      skusEstoqueCritico: 10, // cap 12
      metaEmRisco: true, // 10
    });
    // soma bruta: 30+25+20+20+15+12+10 = 132 → cap 100
    expect(r.score).toBe(100);
    expect(r.nivel).toBe('critico');
  });

  it('faixa fronteira: score 50 → critico', () => {
    // erro(25) + quedaVendas(20) + metaEmRisco(10)? = 55, precisamos exatos 50: erro(25)+ultimoReportFailed? não pode.
    // usar quedaVendas(20)+ultimoReportFailed(25)+skus(2*4=... ) melhor: 30(expirado)+20(queda)=50 exato
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'expirado', quedaVendas: true });
    expect(r.score).toBe(50);
    expect(r.nivel).toBe('critico');
  });

  it('faixa fronteira: score 25 → atencao', () => {
    const r = calcularRisco({ ...SAUDAVEL, conexao: 'erro' });
    expect(r.score).toBe(25);
    expect(r.nivel).toBe('atencao');
  });

  it('faixa fronteira: score 24 → ok', () => {
    // 4 skus criticos (12) + 3 tasks atrasadas (15, sem estourar cap pois 3*5=15) = 27... precisamos 24 exato.
    // 5 skus (cap 12) + 2 tasks (10) = 22; +? vamos montar 24 diretamente: 6 skus->cap12 + 2 tasks(10)=22 ainda nao.
    // Mais simples: 24 = skusEstoqueCritico 6 (6*4=24, sem cap pois cap é 12 -> na verdade estoura). Usar combinação exata:
    // metaEmRisco(10) + tasksAtrasadas 2 (10) + skusEstoqueCritico 1 (4) = 24
    const r = calcularRisco({ ...SAUDAVEL, metaEmRisco: true, tasksAtrasadas: 2, skusEstoqueCritico: 1 });
    expect(r.score).toBe(24);
    expect(r.nivel).toBe('ok');
  });

  it('motivos ordenados por peso desc', () => {
    const r = calcularRisco({
      ...SAUDAVEL,
      metaEmRisco: true, // 10
      quedaVendas: true, // 20
      conexao: 'expirado', // 30
      tasksAtrasadas: 2, // 10
    });
    expect(r.motivos).toEqual([
      'Conexão Bling expirada',
      'Queda nas vendas',
      '2 tarefas atrasadas',
      'Meta em risco',
    ]);
  });
});
