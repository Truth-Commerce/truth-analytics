import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, reports } from '@/db/schema';
import type { Plano } from '@/modules/auth/user.types';
import { sendReportReadyEmail } from '@/modules/notifications/email';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { proximoRelatorioEm } from '@/modules/pipeline/plan-lock';

export type FinalizeInput = {
  reportId: string;
  orgId: string;
  metricas: Metricas;
  analise: AnaliseIa;
  plano: Plano;
  /** E-mail do administrador da org. Se null/undefined, e-mail de "pronto" é pulado. */
  adminEmail?: string | null;
};

/**
 * Step 5 (finalizar):
 * 1. Atualiza `reports` → status 'done', metricas, analise_ia, erro=null.
 * 2. Seta a trava do plano: `organizations.proximo_relatorio_liberado_em = agora + dias(plano)`.
 * 3. Envia e-mail de "relatório pronto" se adminEmail estiver presente.
 *
 * A trava só é setada AQUI — no caminho de sucesso. Qualquer falha antes deste
 * step mantém proximo_relatorio_liberado_em inalterado.
 */
export async function finalize(input: FinalizeInput): Promise<void> {
  const { reportId, orgId, metricas, analise, plano, adminEmail } = input;

  // 1. Marcar relatório como concluído
  await db
    .update(reports)
    .set({
      status: 'done',
      metricas,
      analise_ia: analise,
      erro: null,
    })
    .where(and(eq(reports.id, reportId), eq(reports.org_id, orgId)));

  // 2. Setar trava do ciclo do plano (só no sucesso)
  await db
    .update(organizations)
    .set({ proximo_relatorio_liberado_em: proximoRelatorioEm(plano) })
    .where(eq(organizations.id, orgId));

  // 3. Notificar admin (no-op se adminEmail ausente ou chaves não configuradas)
  if (adminEmail) {
    await sendReportReadyEmail(adminEmail, reportId);
  }
}
