import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, reports } from '@/db/schema';
import type { Plano } from '@/modules/auth/user.types';
import { sendReportReadyEmail } from '@/modules/notifications/email';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import type { IaUsage } from '@/modules/pipeline/steps/analyze-ia';
import { proximoRelatorioEm } from '@/modules/pipeline/plan-lock';

export type FinalizeInput = {
  reportId: string;
  orgId: string;
  metricas: Metricas;
  analise: AnaliseIa;
  plano: Plano;
  /** E-mail primário do cliente da org. Se null/undefined, e-mail de "pronto" é pulado. */
  clientEmail?: string | null;
  /** Usage da chamada Claude (tokens) — persistido em reports.ia_usage; null p/ retrocompat. */
  iaUsage?: IaUsage | null;
};

/**
 * Step 5 (finalizar):
 * 1. Atualiza `reports` → status 'done', metricas, analise_ia, erro=null.
 * 2. Seta a trava do plano: `organizations.proximo_relatorio_liberado_em = agora + dias(plano)`.
 * 3. Envia e-mail de "relatório pronto" ao cliente se clientEmail estiver presente.
 *
 * A trava só é setada AQUI — no caminho de sucesso. Qualquer falha antes deste
 * step mantém proximo_relatorio_liberado_em inalterado.
 */
export async function finalize(input: FinalizeInput): Promise<void> {
  const { reportId, orgId, metricas, analise, plano, clientEmail, iaUsage } = input;

  // 1+2. Concluir o relatório E setar a trava do ciclo atomicamente: ou ambos
  // persistem, ou nenhum — evita relatório 'done' com trava não setada (que
  // permitiria regenerar) caso o processo morra entre os dois updates.
  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({
        status: 'done',
        etapa: null,
        metricas,
        analise_ia: analise,
        ia_usage: iaUsage ?? null,
        erro: null,
      })
      .where(and(eq(reports.id, reportId), eq(reports.org_id, orgId)));

    // A trava só é setada AQUI — no caminho de sucesso.
    await tx
      .update(organizations)
      .set({ proximo_relatorio_liberado_em: proximoRelatorioEm(plano) })
      .where(eq(organizations.id, orgId));
  });

  // 3. Notificar cliente (fora da transação — e-mail nunca deve reverter o banco;
  // no-op se clientEmail ausente ou chaves não configuradas). Best-effort: um
  // envio jamais pode falhar uma finalização já comprometida (done + trava).
  if (clientEmail) {
    try {
      await sendReportReadyEmail(clientEmail, reportId);
    } catch {
      // e-mail nunca quebra a finalização do relatório
    }
  }
}
