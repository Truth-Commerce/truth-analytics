import { describe, expect, it } from 'vitest';

import { buildKitMessages, KitsIaSchema } from '@/modules/kits/kit-ia';

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

describe('KitsIaSchema', () => {
  it('aceita kit válido e rejeita kit com 1 item só', () => {
    const valido = {
      kits: [
        {
          nome: 'Kit Café da Manhã',
          itens: [
            { sku: 'CANECA', nome: 'Caneca Inox' },
            { sku: 'FILTRO', nome: 'Filtro de Café' },
          ],
          precoSugerido: 79.9,
          argumento: 'Comprados juntos por 7 clientes.',
          canalRecomendado: 'Shopee',
        },
      ],
    };
    expect(KitsIaSchema.safeParse(valido).success).toBe(true);

    const invalido = structuredClone(valido);
    invalido.kits[0]!.itens = [invalido.kits[0]!.itens[0]!];
    expect(KitsIaSchema.safeParse(invalido).success).toBe(false);
  });

  it('rejeita mais de 6 kits', () => {
    const kit = {
      nome: 'K',
      itens: [
        { sku: 'A', nome: 'A' },
        { sku: 'B', nome: 'B' },
      ],
      precoSugerido: 10,
      argumento: 'x',
      canalRecomendado: 'Shopee',
    };
    expect(KitsIaSchema.safeParse({ kits: Array(7).fill(kit) }).success).toBe(false);
  });
});
