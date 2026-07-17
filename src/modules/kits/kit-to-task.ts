import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { kitSuggestions } from '@/db/schema';
import { formatBRL } from '@/lib/format';
import { kitView } from '@/modules/kits/kits-view-model';
import { marcarKitStatus } from '@/modules/kits/kit.repository';
import { createTask } from '@/modules/tasks/task.repository';

/**
 * Miolo do "virar tarefa" (testável sem sessão): carrega o kit escopado por
 * org, cria a task via o repositório do CRM (a MESMA `createTask` usada pelas
 * actions da F2 — ver src/modules/tasks/report-to-task.repository.ts) e marca
 * o kit. Idempotente: kit fora de 'sugerido' → ok:false sem task nova.
 */
export async function kitParaTask(
  orgId: string,
  kitId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const [registro] = await db
    .select()
    .from(kitSuggestions)
    .where(and(eq(kitSuggestions.id, kitId), eq(kitSuggestions.org_id, orgId)));
  if (!registro) return { ok: false, erro: 'kit_nao_encontrado' };
  if (registro.status !== 'sugerido') return { ok: false, erro: 'kit_ja_processado' };

  const v = kitView(registro);
  const descricao = [
    `Kit sugerido pela análise: ${v.titulo}`,
    '',
    'Composição:',
    ...v.itens.map((i) => `- ${i.nome} (${i.sku})`),
    v.precoSugerido !== null ? `Preço sugerido: ${formatBRL(v.precoSugerido)}` : null,
    v.argumento ? `Argumento: ${v.argumento}` : null,
    v.canalRecomendado ? `Canal recomendado: ${v.canalRecomendado}` : null,
    '',
    `_Origem: kit sugerido (comprados juntos em ${v.pedidosJuntos} pedido(s))._`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  const taskId = await createTask({
    orgId,
    titulo: `Montar e anunciar: ${v.titulo}`.slice(0, 200),
    descricao,
    tipo: 'catalogo',
    prioridade: 'media',
    criadoPor: 'cliente',
    reportId: registro.report_id,
  });

  const marcado = await marcarKitStatus(orgId, kitId, 'virou_task', taskId);
  return { ok: marcado };
}
