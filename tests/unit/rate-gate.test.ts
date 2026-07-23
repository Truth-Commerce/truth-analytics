import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { criarPortao } from '@/lib/rate-gate';

describe('criarPortao — teto de req/s', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a primeira passagem e imediata', async () => {
    const portao = criarPortao(340);
    let passou = false;
    void portao().then(() => (passou = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(passou).toBe(true);
  });

  it('espaca chamadas concorrentes pelo intervalo (nao dispara em rajada)', async () => {
    const portao = criarPortao(100);
    const instantes: number[] = [];
    const inicio = Date.now();

    // 5 chamadas disparadas juntas — o cenario que estoura o limite do Bling.
    const todas = Promise.all(
      Array.from({ length: 5 }, () => portao().then(() => instantes.push(Date.now() - inicio))),
    );

    await vi.advanceTimersByTimeAsync(1000);
    await todas;

    expect(instantes).toEqual([0, 100, 200, 300, 400]);
  });

  it('nao atrasa quando as chamadas ja vem espacadas', async () => {
    const portao = criarPortao(100);
    const inicio = Date.now();
    const instantes: number[] = [];

    for (let i = 0; i < 3; i++) {
      const p = portao().then(() => instantes.push(Date.now() - inicio));
      await vi.advanceTimersByTimeAsync(500);
      await p;
    }

    expect(instantes).toEqual([0, 500, 1000]);
  });

  it('intervalo invalido e rejeitado na criacao', () => {
    expect(() => criarPortao(-1)).toThrow('intervalo_invalido');
    expect(() => criarPortao(Number.NaN)).toThrow('intervalo_invalido');
  });
});
