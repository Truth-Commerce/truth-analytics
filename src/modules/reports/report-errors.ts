/**
 * Tradução de códigos de erro do pipeline para copy amigável pt-BR.
 * O valor cru de reports.erro é técnico (código ou stack) e NUNCA
 * deve ser exibido ao cliente — só o admin vê o cru (Task 10).
 */
const ERRO_LABEL: Record<string, string> = {
  timeout_watchdog:
    'A geração demorou mais que o esperado e foi interrompida. Tente novamente — se persistir, fale com o suporte.',
  analise_ia_invalida:
    'Nossa IA não conseguiu concluir a análise desta vez. Gere o relatório novamente.',
  sem_conexao_bling:
    'A conexão com o Bling não estava disponível. Reconecte em Conexões e tente de novo.',
  refresh_bling_falhou:
    'A autorização do Bling expirou. Reconecte em Conexões e gere o relatório novamente.',
  bling_sem_pedidos: 'Não encontramos pedidos no período analisado.',
  relatorio_em_andamento: 'Já existe um relatório em geração para a sua conta. Aguarde ele terminar.',
  // Códigos adicionais que podem chegar a reports.erro pelo orchestrator
  // (fallback genérico já cobriria — estas são só copy mais amigável).
  bling_indisponivel:
    'O Bling não respondeu a tempo. Aguarde alguns instantes e gere o relatório novamente.',
  bling_token_falhou:
    'A autorização do Bling expirou. Reconecte em Conexões e gere o relatório novamente.',
  bling_oauth_nao_configurado:
    'A conexão com o Bling não está configurada. Reconecte em Conexões e tente de novo.',
  ia_nao_configurada:
    'A análise por IA está temporariamente indisponível. Tente novamente em instantes.',
  sem_plano: 'Sua conta não tem um plano ativo. Fale com o suporte para gerar relatórios.',
  org_nao_encontrada: 'Não foi possível carregar os dados da sua conta. Tente novamente.',
};

const ERRO_GENERICO =
  'Não foi possível concluir este relatório. Tente gerar novamente — se persistir, fale com o suporte.';

export function friendlyReportError(erro: string | null): string {
  if (!erro) return ERRO_GENERICO;
  return ERRO_LABEL[erro] ?? ERRO_GENERICO;
}
