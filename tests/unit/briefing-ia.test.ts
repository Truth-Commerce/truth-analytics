import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  buildBriefingMessages,
  BriefingIaSchema,
  normalizarBriefing,
} from '@/modules/analista/briefing-ia';

function achaKeyword(obj: unknown, alvo: string): boolean {
  if (obj === null || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.some((v) => achaKeyword(v, alvo));
  return Object.entries(obj as Record<string, unknown>).some(
    ([k, v]) => k === alvo || achaKeyword(v, alvo),
  );
}

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

  it('o JSON schema enviado à API não tem maxItems (regressão do 400)', () => {
    const jsonSchema = zodToJsonSchema(BriefingIaSchema, { $refStrategy: 'none' });
    expect(achaKeyword(jsonSchema, 'maxItems')).toBe(false);
    expect(achaKeyword(jsonSchema, 'minItems')).toBe(false);
  });

  it('rejeita campo extra (strict)', () => {
    const invalido = { ...VALIDO, extra: 'nao deveria existir' };
    expect(BriefingIaSchema.safeParse(invalido).success).toBe(false);
  });
});

describe('normalizarBriefing', () => {
  it('corta prioridades/argumentos/riscos nos tetos (5/5/4)', () => {
    const r = normalizarBriefing({
      prioridades: Array(8).fill('p'),
      argumentosReuniao: Array(8).fill('a'),
      riscos: Array(8).fill('r'),
    });
    expect(r.prioridades).toHaveLength(5);
    expect(r.argumentosReuniao).toHaveLength(5);
    expect(r.riscos).toHaveLength(4);
  });
});
