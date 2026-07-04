/**
 * Limitador de concorrência mínimo (substitui a lib p-limit — sem dependência nova).
 * Uso: const limit = pLimit(6); await Promise.all(jobs.map((j) => limit(() => run(j))));
 */
export function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('concorrencia_invalida');
  }
  let ativos = 0;
  const fila: (() => void)[] = [];

  function libera(): void {
    ativos--;
    const proximo = fila.shift();
    if (proximo) proximo();
  }

  return async function executa<T>(fn: () => Promise<T>): Promise<T> {
    if (ativos >= concurrency) {
      await new Promise<void>((resolve) => fila.push(resolve));
    }
    ativos++;
    try {
      return await fn();
    } finally {
      libera();
    }
  };
}
