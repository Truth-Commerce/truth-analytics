import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations } from '@/db/schema';
import { logger } from '@/lib/logger';
import { gerarBriefingComIA } from '@/modules/analista/briefing-ia';
import { insertBriefing, setBriefingIaUsage } from '@/modules/analista/briefing.repository';
import { getReportById } from '@/modules/reports/report.repository';

export type GerarBriefingInput = {
  orgId: string;
  reportId: string;
  orgName: string;
  nicho: string | null;
};

/**
 * Gera a pauta IA do analista para o ciclo — best-effort: caminhos sem
 * sinal/IA retornam null; erros de DB propagam e são capturados pelo
 * try/catch do módulo de extras pós-finalize (pos-finalize-extras.ts).
 *
 * Só roda a IA quando a org TEM analista atribuído (`analista_id`) — sem
 * analista não há para quem servir a pauta, então a checagem vem ANTES de
 * qualquer chamada Claude para não gastar à toa.
 */
export async function gerarBriefingDoCiclo(
  input: GerarBriefingInput,
): Promise<{ prioridades: number } | null> {
  const [org] = await db
    .select({ analista_id: organizations.analista_id })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);
  if (!org || !org.analista_id) return null;

  const report = await getReportById(input.reportId, input.orgId);
  if (!report || !report.analiseIa) return null;

  const achadosTitulos = (report.analiseIa.achados ?? []).map((a) => a.titulo);
  const truthScore = report.metricas?.truth_score?.score ?? null;

  const resultado = await gerarBriefingComIA({
    orgName: input.orgName,
    nicho: input.nicho,
    resumoExecutivo: report.analiseIa.resumoExecutivo,
    achadosTitulos,
    truthScore,
  });

  // Custo é real mesmo quando a pauta falha (refusal/truncado/parse) — grava
  // o usage sempre que houve ao menos 1 chamada, para a governança de custo
  // nunca descartar gasto já efetuado.
  if (resultado.usage.tentativas > 0) {
    await setBriefingIaUsage(input.orgId, input.reportId, resultado.usage);
  }
  if (!resultado.briefing) return null;

  await insertBriefing(input.orgId, input.reportId, resultado.briefing);
  logger.info('briefing.gerado', { orgId: input.orgId, reportId: input.reportId });
  return { prioridades: resultado.briefing.prioridades.length };
}
