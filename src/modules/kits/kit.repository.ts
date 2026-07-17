import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { kitSuggestions, reports, type KitSuggestionRecord } from '@/db/schema';
import type { KitIa } from '@/modules/kits/kit-ia';
import type { KitCandidato } from '@/modules/kits/market-basket';

/** Evidência do candidato cujos 2 skus estão no kit (0 se a IA compôs diferente). */
function evidenciaDoKit(kit: KitIa, candidatos: KitCandidato[]): number {
  const skus = new Set(kit.itens.map((i) => i.sku));
  const match = candidatos.find((c) => skus.has(c.skus[0]) && skus.has(c.skus[1]));
  return match?.pedidosJuntos ?? 0;
}

export async function insertKits(
  orgId: string,
  reportId: string,
  kits: KitIa[],
  candidatos: KitCandidato[],
): Promise<number> {
  if (kits.length === 0) return 0;
  await db.insert(kitSuggestions).values(
    kits.map((k) => ({
      org_id: orgId,
      report_id: reportId,
      titulo: k.nome.slice(0, 200),
      payload: {
        itens: k.itens,
        precoSugerido: k.precoSugerido,
        argumento: k.argumento,
        canalRecomendado: k.canalRecomendado,
        evidencia: { pedidosJuntos: evidenciaDoKit(k, candidatos) },
      },
    })),
  );
  return kits.length;
}

/** Kits do ciclo mais recente que tem kits. Escopado por org_id. */
export async function listKitsUltimoCiclo(orgId: string): Promise<KitSuggestionRecord[]> {
  const [ultimo] = await db
    .select({ report_id: kitSuggestions.report_id, created_at: kitSuggestions.created_at })
    .from(kitSuggestions)
    .where(eq(kitSuggestions.org_id, orgId))
    .orderBy(desc(kitSuggestions.created_at))
    .limit(1);
  if (!ultimo) return [];
  return db
    .select()
    .from(kitSuggestions)
    .where(and(eq(kitSuggestions.org_id, orgId), eq(kitSuggestions.report_id, ultimo.report_id)))
    .orderBy(desc(kitSuggestions.created_at));
}

/** Transição única sugerido→(virou_task|descartado), escopada por org. */
export async function marcarKitStatus(
  orgId: string,
  kitId: string,
  status: 'virou_task' | 'descartado',
  taskId?: string,
): Promise<boolean> {
  const rows = await db
    .update(kitSuggestions)
    .set({ status, ...(taskId ? { task_id: taskId } : {}) })
    .where(
      and(
        eq(kitSuggestions.id, kitId),
        eq(kitSuggestions.org_id, orgId),
        eq(kitSuggestions.status, 'sugerido'),
      ),
    )
    .returning({ id: kitSuggestions.id });
  return rows.length > 0;
}

export async function setKitsIaUsage(reportId: string, usage: unknown): Promise<void> {
  await db.update(reports).set({ kits_ia_usage: usage }).where(eq(reports.id, reportId));
}
