import { describe, expect, it } from 'vitest';

import { secretsMatch } from '@/lib/secret-compare';

describe('secretsMatch — comparação em tempo constante', () => {
  it('retorna true para segredos idênticos', () => {
    expect(secretsMatch('Bearer abc123', 'Bearer abc123')).toBe(true);
  });

  it('retorna false para segredo divergente de mesmo tamanho', () => {
    expect(secretsMatch('Bearer abc123', 'Bearer abc124')).toBe(false);
  });

  it('retorna false quando o recebido é nulo', () => {
    expect(secretsMatch(null, 'Bearer abc123')).toBe(false);
  });

  it('retorna false quando os comprimentos divergem', () => {
    expect(secretsMatch('Bearer abc', 'Bearer abc123')).toBe(false);
  });
});
