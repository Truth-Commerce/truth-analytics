import { logger } from '@/lib/logger';
import { gerarKitsDoCiclo } from '@/modules/kits/gerar-kits';
import { gravarNichoSeVazio, inferirNichoComIA } from '@/modules/pipeline/steps/nicho-ia';

/** Contexto repassado ao passo de calendário (T4 pluga a implementação real). */
export type PosFinalizeExtrasCtx = {
  orgId: string;
  reportId: string;
  orgName: string;
  nicho: string | null;
  ticketMedio: number | null;
  topProdutos: string[];
};

export type PosFinalizeExtrasInput = PosFinalizeExtrasCtx & {
  /**
   * Ponto de extensão tipado para o passo 3 (calendário) — ausente = passo
   * pulado silenciosamente. A T4 pluga a implementação real como default.
   */
  gerarCalendario?: (ctx: PosFinalizeExtrasCtx) => Promise<unknown>;
};

/**
 * Módulo único de extras pós-finalize do pipeline (H2/H3): nicho → kits →
 * calendário. SEMPRE best-effort — NUNCA lança (try/catch por passo) — pois
 * roda depois de `finalize`, quando o relatório principal já está gravado;
 * nenhuma falha aqui pode voltar a afetar o resultado do pipeline.
 */
export async function executarExtrasPosFinalize(input: PosFinalizeExtrasInput): Promise<void> {
  let nicho = input.nicho;

  // Passo 1: inferir nicho por IA — só quando a org ainda não tem nicho
  // cadastrado. O nicho inferido (quando gravado) é repassado aos passos
  // seguintes desta mesma execução.
  if (nicho === null) {
    try {
      const resultado = await inferirNichoComIA({
        orgName: input.orgName,
        topProdutos: input.topProdutos,
      });
      if (resultado.nicho !== null) {
        await gravarNichoSeVazio(input.orgId, resultado.nicho);
        nicho = resultado.nicho;
      }
    } catch (err) {
      logger.warn('extras.nicho_falhou', {
        orgId: input.orgId,
        reportId: input.reportId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Passo 2: kits do ciclo (H2 — movido do orquestrador, comportamento idêntico).
  try {
    await gerarKitsDoCiclo({
      orgId: input.orgId,
      reportId: input.reportId,
      orgName: input.orgName,
      nicho,
      ticketMedio: input.ticketMedio,
    });
  } catch (err) {
    logger.warn('extras.kits_falhou', {
      orgId: input.orgId,
      reportId: input.reportId,
      erro: err instanceof Error ? err.message : String(err),
    });
  }

  // Passo 3: calendário (H3) — ponto de extensão tipado; sem função
  // injetada, o passo é pulado silenciosamente (dormente até a T4).
  if (input.gerarCalendario) {
    try {
      await input.gerarCalendario({
        orgId: input.orgId,
        reportId: input.reportId,
        orgName: input.orgName,
        nicho,
        ticketMedio: input.ticketMedio,
        topProdutos: input.topProdutos,
      });
    } catch (err) {
      logger.warn('extras.calendario_falhou', {
        orgId: input.orgId,
        reportId: input.reportId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
