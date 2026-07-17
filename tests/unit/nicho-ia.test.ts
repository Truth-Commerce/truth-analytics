import { describe, expect, it } from 'vitest';

import { buildNichoMessages, NichoIaSchema } from '@/modules/pipeline/steps/nicho-ia';

describe('buildNichoMessages', () => {
  it('inclui loja e produtos e pede UMA palavra/expressão curta', () => {
    const { system, user } = buildNichoMessages({
      orgName: 'Loja X',
      topProdutos: ['Caneca Inox', 'Filtro de Café'],
    });
    expect(system).toContain('nicho');
    expect(system).toContain('JSON');
    expect(user).toContain('Loja X');
    expect(user).toContain('Caneca Inox');
  });
});

describe('NichoIaSchema', () => {
  it('aceita nicho curto e rejeita vazio/longo', () => {
    expect(NichoIaSchema.safeParse({ nicho: 'cozinha e utilidades' }).success).toBe(true);
    expect(NichoIaSchema.safeParse({ nicho: '' }).success).toBe(false);
    expect(NichoIaSchema.safeParse({ nicho: 'x'.repeat(61) }).success).toBe(false);
  });
});
