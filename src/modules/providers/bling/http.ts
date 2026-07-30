import { logger } from '@/lib/logger';

const MAX_TENTATIVAS = 3;
const BASE_DELAY_MS = 1000;
const MAX_RETRY_AFTER_MS = 30_000;

function remaining(deadlineAt?: number): number { return deadlineAt === undefined ? Infinity : deadlineAt - Date.now(); }
function ensureDeadline(deadlineAt?: number): void { if (remaining(deadlineAt) <= 0) throw new Error('bling_deadline_exceeded'); }
function sleep(ms: number, deadlineAt?: number): Promise<void> {
  ensureDeadline(deadlineAt);
  return new Promise((resolve, reject) => setTimeout(() => {
    if (remaining(deadlineAt) <= 0) reject(new Error('bling_deadline_exceeded')); else resolve();
  }, Math.min(ms, remaining(deadlineAt))));
}

/**
 * GET autenticado no Bling com backoff:
 * - 429/5xx: até 3 tentativas; honra Retry-After (segundos, cap 30s), senão 1s/2s exponencial.
 * - 4xx ≠ 429: falha dura imediata (bling_indisponivel).
 * - Esgotou as tentativas: bling_erro_<status> (ou bling_indisponivel em erro de rede).
 */
export async function fetchBling(url: string, token: string, options: { deadlineAt?: number } = {}): Promise<Response> {
  let ultimaFalha = 'bling_indisponivel';
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    let res: Response;
    try {
      ensureDeadline(options.deadlineAt);
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: options.deadlineAt === undefined ? undefined : AbortSignal.timeout(Math.max(1, remaining(options.deadlineAt))),
      });
    } catch {
      ultimaFalha = 'bling_indisponivel';
      logger.warn('bling: erro de rede, tentando novamente', { tentativa, url });
      if (tentativa < MAX_TENTATIVAS) {
        await sleep(BASE_DELAY_MS * 2 ** (tentativa - 1), options.deadlineAt);
      }
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      ultimaFalha = `bling_erro_${res.status}`;
      if (tentativa < MAX_TENTATIVAS) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
            : BASE_DELAY_MS * 2 ** (tentativa - 1);
        logger.warn('bling: resposta com backoff, aguardando para refazer', {
          tentativa,
          status: res.status,
          delayMs: delay,
        });
        await sleep(delay, options.deadlineAt);
      }
      continue;
    }
    if (!res.ok) {
      throw new Error('bling_indisponivel');
    }
    return res;
  }
  throw new Error(ultimaFalha);
}
