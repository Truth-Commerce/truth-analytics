/**
 * Feedback do retorno do OAuth Bling (puro) — o callback redireciona para
 * /conexoes?ok=1 | ?erro=state_invalido | ?erro=falha_conexao (ver
 * src/app/api/connections/bling/callback/route.ts). Antes do G0 esses params
 * eram descartados e a falha de conexão não mudava NADA na tela — no passo 1
 * do onboarding.
 */
export type CallbackFeedback = {
  variante: 'success' | 'danger';
  titulo: string;
  mensagem: string;
};

const MENSAGENS_ERRO: Record<string, string> = {
  state_invalido:
    'A autorização expirou ou o link é inválido. Clique em "Conectar Bling" e tente de novo.',
  falha_conexao:
    'Não foi possível concluir a conexão com o Bling. Aguarde alguns instantes e tente novamente.',
};

export function feedbackDeCallback(
  searchParams?: { ok?: string; erro?: string },
): CallbackFeedback | null {
  if (!searchParams) return null;
  if (searchParams.ok === '1') {
    return {
      variante: 'success',
      titulo: 'Bling conectado!',
      mensagem: 'Você já pode gerar sua análise no Dashboard.',
    };
  }
  if (searchParams.erro) {
    return {
      variante: 'danger',
      titulo: 'Falha ao conectar o Bling',
      mensagem:
        MENSAGENS_ERRO[searchParams.erro] ?? 'Não foi possível conectar. Tente novamente.',
    };
  }
  return null;
}
