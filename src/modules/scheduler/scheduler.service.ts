/** Teto de orgs processadas por execução do cron — evita função monolítica estourar maxDuration. */
export const LOTE_MAXIMO_POR_EXECUCAO = 20;

/** Pausa entre orgs dentro do lote — evita rajada de POSTs simultâneos ao pipeline/Bling/Claude. */
export const ESPACAMENTO_ENTRE_ORGS_MS = 2000;

/** Backoff: org cujo ÚLTIMO report é failed há menos de N dias sai da elegibilidade automática. */
export const BACKOFF_FALHA_DIAS = 2;
/** Após N relatórios failed consecutivos, geracao_automatica é desligada e o admin avisado. */
export const FALHAS_CONSECUTIVAS_PAUSA = 3;

export type OrgElegibilidade = {
  status: string;
  plano: string | null;
  geracao_automatica: boolean;
  proximo_relatorio_liberado_em: Date | null;
  blingConectado: boolean;
};

/** Pura. Elegível = active + plano + geração automática ligada + Bling ok + ciclo vencido (ou nunca liberado). */
export function deveGerarAutomaticamente(org: OrgElegibilidade, agora: Date): boolean {
  if (org.status !== 'active') return false;
  if (!org.plano) return false;
  if (!org.geracao_automatica) return false;
  if (!org.blingConectado) return false;
  if (org.proximo_relatorio_liberado_em !== null && org.proximo_relatorio_liberado_em > agora) {
    return false;
  }
  return true;
}
