import { logger } from '@/lib/logger';
import { gerarBriefingDoCiclo } from '@/modules/analista/gerar-briefing';
import { gerarCalendarioDoCiclo } from '@/modules/calendario/gerar-calendario';
import { gerarKitsDoCiclo } from '@/modules/kits/gerar-kits';
import { gravarNichoSeVazio, inferirNichoComIA } from '@/modules/pipeline/steps/nicho-ia';

/** Contexto repassado aos passos de calendário/briefing. */
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
   * Seam de teste para o passo 3 (calendário) — sem valor injetado, usa
   * `gerarCalendarioDoCiclo` (implementação real) como default.
   */
  gerarCalendario?: (ctx: PosFinalizeExtrasCtx) => Promise<unknown>;
  /**
   * Seam de teste para o passo 4 (briefing) — sem valor injetado, usa
   * `gerarBriefingDoCiclo` (implementação real) como default.
   */
  gerarBriefing?: (ctx: PosFinalizeExtrasCtx) => Promise<unknown>;
};

/**
 * Módulo único de extras pós-finalize do pipeline (H2/H3/H4): nicho → kits →
 * calendário → briefing IA do analista. SEMPRE best-effort — NUNCA lança
 * (try/catch por passo, mais um try/catch externo de defesa em profundidade)
 * — pois roda depois de `finalize`, quando o relatório principal já está
 * gravado; nenhuma falha aqui pode voltar a afetar o resultado do pipeline.
 */
export async function executarExtrasPosFinalize(input: PosFinalizeExtrasInput): Promise<void> {
  try {
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
        logger.info('extras.nicho_ia_usage', {
          orgId: input.orgId,
          inputTokens: resultado.usage.input_tokens,
          outputTokens: resultado.usage.output_tokens,
          tentativas: resultado.usage.tentativas,
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
    // injetada, usa a implementação real (`gerarCalendario` fica só como
    // seam de teste).
    const gerarCalendario = input.gerarCalendario ?? gerarCalendarioDoCiclo;
    try {
      await gerarCalendario({
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

    // Passo 4: pauta IA do analista (H4) — mesmo padrão do passo 3, seam
    // próprio de teste + try/catch isolado.
    const gerarBriefing = input.gerarBriefing ?? gerarBriefingDoCiclo;
    try {
      await gerarBriefing({
        orgId: input.orgId,
        reportId: input.reportId,
        orgName: input.orgName,
        nicho,
        ticketMedio: input.ticketMedio,
        topProdutos: input.topProdutos,
      });
    } catch (err) {
      logger.warn('extras.briefing_falhou', {
        orgId: input.orgId,
        reportId: input.reportId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (err) {
    // Defesa em profundidade: nenhum código entre os passos deve escapar
    // desprotegido, mas se um futuro edit introduzir um trecho sem
    // try/catch próprio, este catch externo garante que extras NUNCA lança
    // de volta para o orquestrador (que já finalizou o relatório principal).
    logger.warn('extras.fatal_inesperado', {
      orgId: input.orgId,
      reportId: input.reportId,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
}
