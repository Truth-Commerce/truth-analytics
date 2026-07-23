/**
 * Portão de vazão: garante um intervalo mínimo entre INÍCIOS de requisição.
 *
 * Diferente de um limitador de concorrência (`pLimit`), que só controla quantas
 * chamadas correm ao mesmo tempo, este controla a TAXA. Com respostas rápidas,
 * `pLimit(3)` dispara muito mais que 3 req/s — e o Bling responde a excesso com
 * bloqueio de IP (300 erros em 10s ⇒ 10 minutos de bloqueio). Os dois se somam:
 * o portão fixa o teto de req/s, o pLimit esconde a latência.
 *
 * Uso: const portao = criarPortao(340); await portao(); await fetch(...)
 */
export function criarPortao(intervaloMs: number): () => Promise<void> {
  if (!Number.isFinite(intervaloMs) || intervaloMs < 0) {
    throw new Error('intervalo_invalido');
  }
  // Instante em que a próxima requisição pode começar. Reservado de forma
  // síncrona (antes de qualquer await), então chamadas concorrentes pegam
  // fatias distintas e nunca colidem no mesmo slot.
  let proximoLivre = 0;

  return async function aguardar(): Promise<void> {
    const agora = Date.now();
    const alvo = Math.max(agora, proximoLivre);
    proximoLivre = alvo + intervaloMs;
    const espera = alvo - agora;
    if (espera > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, espera));
    }
  };
}
