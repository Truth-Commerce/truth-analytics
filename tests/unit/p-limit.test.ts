import { describe, expect, it } from 'vitest';

import { pLimit } from '@/lib/p-limit';

function deferido(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('pLimit', () => {
  it('nunca excede a concorrência', async () => {
    const limit = pLimit(2);
    let ativos = 0;
    let pico = 0;
    const gates = Array.from({ length: 5 }, deferido);
    const jobs = gates.map((g) =>
      limit(async () => {
        ativos++;
        pico = Math.max(pico, ativos);
        await g.promise;
        ativos--;
      }),
    );
    await Promise.resolve(); // deixa os 2 primeiros entrarem
    expect(pico).toBeLessThanOrEqual(2);
    gates.forEach((g) => g.resolve());
    await Promise.all(jobs);
    expect(pico).toBe(2);
  });

  it('propaga o resultado e a rejeição sem travar a fila', async () => {
    const limit = pLimit(1);
    await expect(limit(async () => 42)).resolves.toBe(42);
    await expect(limit(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(limit(async () => 'depois')).resolves.toBe('depois');
  });

  it('rejeita concorrência inválida', () => {
    expect(() => pLimit(0)).toThrow('concorrencia_invalida');
  });
});
