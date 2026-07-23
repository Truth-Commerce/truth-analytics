import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { buildKitMessages, KitsIaSchema, normalizarKits } from '@/modules/kits/kit-ia';

/** Varre um JSON schema atrás de qualquer keyword que a API de structured output rejeita. */
function achaKeyword(obj: unknown, alvo: string): boolean {
  if (obj === null || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.some((v) => achaKeyword(v, alvo));
  return Object.entries(obj as Record<string, unknown>).some(
    ([k, v]) => k === alvo || achaKeyword(v, alvo),
  );
}

const CANDIDATOS = [
  {
    skus: ['CANECA', 'FILTRO'] as [string, string],
    nomes: ['Caneca Inox', 'Filtro de Café'] as [string, string],
    pedidosJuntos: 7,
  },
];

describe('buildKitMessages', () => {
  it('inclui nicho, candidatos com evidência e regras de resposta', () => {
    const { system, user } = buildKitMessages({
      orgName: 'Loja Teste',
      nicho: 'cozinha',
      candidatos: CANDIDATOS,
      ticketMedio: 89.9,
    });
    expect(system).toContain('kits');
    expect(system).toContain('JSON');
    expect(user).toContain('Loja Teste');
    expect(user).toContain('cozinha');
    expect(user).toContain('Caneca Inox');
    expect(user).toContain('7 pedido');
    expect(user).toContain('89,90');
  });

  it('sem nicho e sem ticket usa fallbacks sem quebrar', () => {
    const { user } = buildKitMessages({
      orgName: 'Loja X',
      nicho: null,
      candidatos: CANDIDATOS,
      ticketMedio: null,
    });
    expect(user).toContain('não informado');
  });
});

function kitCom(itens: number) {
  return {
    nome: 'K',
    itens: Array.from({ length: itens }, (_, i) => ({ sku: `S${i}`, nome: `N${i}` })),
    precoSugerido: 10,
    argumento: 'x',
    canalRecomendado: 'Shopee',
  };
}

describe('KitsIaSchema', () => {
  it('aceita kit válido', () => {
    expect(KitsIaSchema.safeParse({ kits: [kitCom(2)] }).success).toBe(true);
  });

  // O schema NÃO carrega mais maxItems/minItems (a API de structured output os rejeita
  // com 400). Cardinalidade agora é responsabilidade de normalizarKits.
  it('o JSON schema enviado à API não tem maxItems nem minItems (regressão do 400)', () => {
    const jsonSchema = zodToJsonSchema(KitsIaSchema, { $refStrategy: 'none' });
    expect(achaKeyword(jsonSchema, 'maxItems')).toBe(false);
    expect(achaKeyword(jsonSchema, 'minItems')).toBe(false);
  });
});

describe('normalizarKits', () => {
  it('descarta kit com menos de 2 itens', () => {
    const r = normalizarKits([kitCom(1), kitCom(2)] as never);
    expect(r).toHaveLength(1);
    expect(r[0]!.itens).toHaveLength(2);
  });

  it('corta em 6 kits', () => {
    const r = normalizarKits(Array.from({ length: 9 }, () => kitCom(2)) as never);
    expect(r).toHaveLength(6);
  });
});
