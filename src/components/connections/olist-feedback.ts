export type OlistFeedback = {
  variant: 'success' | 'danger';
  title: string;
  message: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  olist_parametros_invalidos: 'Os dados da solicitação são inválidos.',
  olist_state_invalido: 'A tentativa expirou ou não pôde ser validada. Tente novamente.',
  olist_autorizacao_negada: 'A autorização foi cancelada no Olist.',
  olist_autorizacao_falhou: 'O Olist recusou a autorização. Revise o aplicativo e tente novamente.',
  olist_credenciais_ausentes: 'Salve o Client ID e o Client Secret antes de autorizar.',
  olist_credenciais_alteradas: 'As credenciais mudaram durante a autorização. Comece novamente.',
  olist_oauth_transiente: 'O Olist está temporariamente indisponível. Tente novamente em instantes.',
  acesso_negado: 'Você não tem acesso a esta organização.',
  organizacao_inativa: 'Esta organização não está ativa.',
};

export function olistFeedback(params?: { olist?: string; erro?: string }): OlistFeedback | null {
  if (params?.olist === 'conectado') {
    return {
      variant: 'success',
      title: 'Olist autorizado',
      message: 'A autorização foi concluída. A importação de dados será ativada em uma próxima fase.',
    };
  }
  if (!params?.erro) return null;
  const message = Object.hasOwn(ERROR_MESSAGES, params.erro)
    ? ERROR_MESSAGES[params.erro]
    : 'Tente novamente. Se o problema continuar, fale com o suporte.';
  return {
    variant: 'danger',
    title: 'Não foi possível conectar ao Olist',
    message,
  };
}
