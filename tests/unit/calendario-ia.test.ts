import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  buildCalendarioMessages,
  CalendarioIaSchema,
  normalizarSugestoes,
} from '@/modules/calendario/calendario-ia';

function achaKeyword(obj: unknown, alvo: string): boolean {
  if (obj === null || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.some((v) => achaKeyword(v, alvo));
  return Object.entries(obj as Record<string, unknown>).some(
    ([k, v]) => k === alvo || achaKeyword(v, alvo),
  );
}

const DATAS = [
  {
    nome: 'Black Friday',
    dataISO: '2026-11-27',
    dica: 'Anuncie com 2-3 semanas de antecedência.',
  },
];

const TOP_PRODUTOS = [{ sku: 'CANECA', nome: 'Caneca Inox' }];

describe('buildCalendarioMessages', () => {
  it('inclui loja, nicho, datas com dicas e produtos com skus e exige JSON', () => {
    const { system, user } = buildCalendarioMessages({
      orgName: 'Loja Teste',
      nicho: 'cozinha',
      datas: DATAS,
      topProdutos: TOP_PRODUTOS,
    });
    expect(system).toContain('calendário');
    expect(system).toContain('JSON');
    expect(user).toContain('Loja Teste');
    expect(user).toContain('cozinha');
    expect(user).toContain('Black Friday');
    expect(user).toContain('2026-11-27');
    expect(user).toContain('Anuncie com 2-3 semanas');
    expect(user).toContain('CANECA');
    expect(user).toContain('Caneca Inox');
  });

  it('sem nicho usa fallback "não informado"', () => {
    const { user } = buildCalendarioMessages({
      orgName: 'Loja X',
      nicho: null,
      datas: DATAS,
      topProdutos: TOP_PRODUTOS,
    });
    expect(user).toContain('não informado');
  });
});

describe('CalendarioIaSchema', () => {
  it('aceita sugestão válida e rejeita dataISO malformada', () => {
    const valido = {
      sugestoes: [
        {
          dataISO: '2026-11-27',
          nomeData: 'Black Friday',
          titulo: 'Anuncie a Black Friday',
          sugestao: 'Destaque a Caneca Inox (CANECA) com desconto especial.',
          skus: ['CANECA'],
        },
      ],
    };
    expect(CalendarioIaSchema.safeParse(valido).success).toBe(true);

    // '2026-13-1' falha no regex simples ^\d{4}-\d{2}-\d{2}$ por ter 1 dígito
    // no dia (não valida faixa de mês/dia — só o formato de dígitos).
    const invalido = structuredClone(valido);
    invalido.sugestoes[0]!.dataISO = '2026-13-1';
    expect(CalendarioIaSchema.safeParse(invalido).success).toBe(false);
  });

  it('o JSON schema enviado à API não tem maxItems nem minItems (regressão do 400)', () => {
    const jsonSchema = zodToJsonSchema(CalendarioIaSchema, { $refStrategy: 'none' });
    expect(achaKeyword(jsonSchema, 'maxItems')).toBe(false);
    expect(achaKeyword(jsonSchema, 'minItems')).toBe(false);
  });
});

describe('normalizarSugestoes', () => {
  it('corta em 8 sugestões', () => {
    const sugestao = {
      dataISO: '2026-11-27',
      nomeData: 'Black Friday',
      titulo: 'Anuncie a Black Friday',
      sugestao: 'Destaque produtos com desconto.',
      skus: ['CANECA'],
    };
    expect(normalizarSugestoes(Array(12).fill(sugestao))).toHaveLength(8);
  });
});
