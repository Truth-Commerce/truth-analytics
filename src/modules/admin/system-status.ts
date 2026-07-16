/**
 * Saúde de configuração do sistema (puro) — o admin descobre no painel, não
 * pelo cliente reclamando. Recebe SÓ os campos opcionais relevantes do
 * serverEnv e devolve presença/ausência com a CONSEQUÊNCIA em pt-BR.
 * NUNCA expõe valores.
 */
export type SistemaItem = {
  chave: 'resend' | 'serpapi' | 'cron' | 'sentry';
  nome: string;
  ok: boolean;
  opcional: boolean;
  detalhe: string;
};

export function statusDoSistema(env: {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SERPAPI_KEY?: string;
  CRON_SECRET?: string;
  SENTRY_DSN?: string;
}): SistemaItem[] {
  const resendOk = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  const serpapiOk = Boolean(env.SERPAPI_KEY);
  const cronOk = Boolean(env.CRON_SECRET);
  const sentryOk = Boolean(env.SENTRY_DSN);
  return [
    {
      chave: 'resend',
      nome: 'E-mail (Resend)',
      ok: resendOk,
      opcional: false,
      detalhe: resendOk
        ? 'E-mails transacionais ativos (relatório pronto, alertas, reset de senha).'
        : 'E-mails NÃO estão sendo enviados — nem relatório pronto, nem reset de senha (modo no-op).',
    },
    {
      chave: 'serpapi',
      nome: 'Benchmark (SerpAPI)',
      ok: serpapiOk,
      opcional: true,
      detalhe: serpapiOk
        ? 'Benchmark de mercado com Google Shopping + Mercado Livre público.'
        : 'Benchmark de mercado usa apenas o Mercado Livre público (opcional).',
    },
    {
      chave: 'cron',
      nome: 'Crons (CRON_SECRET)',
      ok: cronOk,
      opcional: false,
      detalhe: cronOk
        ? 'Sincronização diária, alertas e geração automática autenticados.'
        : 'Crons diários NÃO estão rodando — sync de pedidos, alertas e geração automática parados.',
    },
    {
      chave: 'sentry',
      nome: 'Monitoramento (Sentry)',
      ok: sentryOk,
      opcional: true,
      detalhe: sentryOk
        ? 'Erros de produção capturados.'
        : 'Erros de produção não estão sendo capturados (opcional).',
    },
  ];
}
