import { waitUntil } from '@vercel/functions';

import { logger } from '@/lib/logger';
import { createPasswordResetToken } from '@/modules/auth/password-reset.repository';
import { sendPasswordResetEmail } from '@/modules/notifications/email';

// Trabalho em background em andamento — usado apenas em testes para aguardar a
// conclusão determinística (`flushPasswordResetTasks`). Em produção o rastreio é
// inócuo; a garantia de execução vem do `waitUntil`.
const emAndamento = new Set<Promise<unknown>>();

/**
 * Dispara a criação do token + envio do e-mail FORA do caminho crítico de resposta.
 *
 * ANTI-ORÁCULO DE TIMING: a action retorna a MESMA resposta imediatamente para
 * e-mail existente ou inexistente, sem esperar o INSERT do token nem a chamada de
 * rede do e-mail (que só ocorrem no caminho "existe"). Sem isso, a diferença de
 * latência revelaria se a conta existe (enumeração).
 *
 * Em serverless (Vercel), `waitUntil` mantém a função viva até o trabalho concluir
 * mesmo após a resposta ter sido enviada. Fora de um contexto de request
 * (testes/local) `waitUntil` é um no-op e o trabalho roda como Promise solta.
 */
export function dispatchPasswordReset(email: string): void {
  const work = (async () => {
    const token = await createPasswordResetToken(email);
    if (token) {
      await sendPasswordResetEmail(email, token);
    }
  })()
    .catch((err) => {
      logger.warn('falha ao processar reset de senha em background', {}, err);
    })
    .finally(() => {
      emAndamento.delete(work);
    });

  emAndamento.add(work);
  waitUntil(work);
}

/**
 * Apenas para testes: aguarda todo o trabalho de reset disparado em background.
 */
export async function flushPasswordResetTasks(): Promise<void> {
  await Promise.all([...emAndamento]);
}
