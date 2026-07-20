import { describe, expect, it } from 'vitest';

import { buildBriefingMessages, BriefingIaSchema } from '@/modules/analista/briefing-ia';

const BASE_INPUT = {
  orgName: 'Loja Teste',
  nicho: 'cozinha' as string | null,
  resumoExecutivo: 'Vendas cresceram 12% no período, puxadas pelo canal Shopee.',
  achadosTitulos: ['Preço da Caneca Inox abaixo do mercado', 'Anúncio sem foto principal'],
  truthScore: 72 as number | null,
};

describe('buildBriefingMessages', () => {
  it('inclui loja, nicho, resumo executivo, achados e truth score e exige JSON', () => {
    const { system, user } = buildBriefingMessages(BASE_INPUT);
    expect(system).toContain('JSON');
    expect(system.toLowerCase()).toContain('consultor');
    expect(user).toContain('Loja Teste');
    expect(user).toContain('cozinha');
    expect(user).toContain('Vendas cresceram 12%');
    expect(user).toContain('Preço da Caneca Inox abaixo do mercado');
    expect(user).toContain('Anúncio sem foto principal');
    expect(user).toContain('72');
  });

  it('sem nicho usa fallback "não informado"', () => {
    const { user } = buildBriefingMessages({ ...BASE_INPUT, nicho: null });
    expect(user).toContain('não informado');
  });

  it('sem truth score usa fallback sem quebrar', () => {
    const { user } = buildBriefingMessages({ ...BASE_INPUT, truthScore: null });
    expect(user).toContain('não disponível');
  });

  it('sem achados usa fallback sem quebrar', () => {
    const { user } = buildBriefingMessages({ ...BASE_INPUT, achadosTitulos: [] });
    expect(user).toContain('nenhum achado');
  });
});

describe('BriefingIaSchema', () => {
  const VALIDO = {
    prioridades: ['Reajustar preço da Caneca Inox', 'Corrigir foto do anúncio principal'],
    argumentosReuniao: ['Você está R$5 abaixo do mercado na Caneca Inox — dá pra subir sem perder venda.'],
    riscos: ['Estoque da Caneca Inox acaba em 2 semanas no ritmo atual.'],
  };

  it('aceita pauta válida', () => {
    expect(BriefingIaSchema.safeParse(VALIDO).success).toBe(true);
  });

  it('rejeita mais de 5 prioridades', () => {
    const invalido = { ...VALIDO, prioridades: Array(6).fill('x') };
    expect(BriefingIaSchema.safeParse(invalido).success).toBe(false);
  });

  it('rejeita mais de 5 argumentosReuniao', () => {
    const invalido = { ...VALIDO, argumentosReuniao: Array(6).fill('x') };
    expect(BriefingIaSchema.safeParse(invalido).success).toBe(false);
  });

  it('rejeita mais de 4 riscos', () => {
    const invalido = { ...VALIDO, riscos: Array(5).fill('x') };
    expect(BriefingIaSchema.safeParse(invalido).success).toBe(false);
  });

  it('rejeita campo extra (strict)', () => {
    const invalido = { ...VALIDO, extra: 'nao deveria existir' };
    expect(BriefingIaSchema.safeParse(invalido).success).toBe(false);
  });
});
