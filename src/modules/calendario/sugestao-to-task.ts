import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { calendarSuggestions } from '@/db/schema';
import { sugestaoView } from '@/modules/calendario/calendario-view-model';
import {
  marcarSugestaoStatus,
  reverterSugestaoParaSugerida,
  setSugestaoTaskId,
} from '@/modules/calendario/calendario.repository';
import { inferTipoTask } from '@/modules/tasks/report-to-task';
import { createTask } from '@/modules/tasks/task.repository';

/**
 * Miolo do "virar tarefa" (testável sem sessão): carrega a sugestão escopada
 * por org, RESERVA-a atomicamente (sugerido→virou_task) antes de criar a
 * task, cria a task via o repositório do CRM (a MESMA `createTask` usada
 * pelas actions da F2/kits) e grava o task_id na reserva.
 *
 * Reserva-primeiro evita a corrida de 2 cliques simultâneos — ver
 * src/modules/kits/kit-to-task.ts (mesmo mecanismo, mirrorado 1:1 aqui). Se
 * createTask falhar após a reserva, compensa revertendo para 'sugerido'.
 *
 * `prazo` recebe o `dataISO` da sugestão diretamente — createTask já aceita
 * `prazo?: string | null` e grava na coluna `tasks.prazo` (date, mode
 * 'string'), então não é preciso nenhum patch pós-criação.
 */
export async function sugestaoParaTask(
  orgId: string,
  sugestaoId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const [registro] = await db
    .select()
    .from(calendarSuggestions)
    .where(and(eq(calendarSuggestions.id, sugestaoId), eq(calendarSuggestions.org_id, orgId)));
  if (!registro) return { ok: false, erro: 'sugestao_nao_encontrada' };

  const reservado = await marcarSugestaoStatus(orgId, sugestaoId, 'virou_task');
  if (!reservado) return { ok: false, erro: 'sugestao_ja_processada' };

  const v = sugestaoView(registro);
  const descricao = [
    `Sugestão sazonal para ${v.nomeData} (${v.dataISO}):`,
    '',
    v.sugestao,
    v.skus.length > 0 ? `SKUs: ${v.skus.join(', ')}` : null,
    '',
    '_Origem: calendário comercial (sugestão IA)._',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  let taskId: string;
  try {
    taskId = await createTask({
      orgId,
      titulo: v.titulo.slice(0, 200),
      descricao,
      tipo: inferTipoTask(v.sugestao),
      prioridade: 'media',
      criadoPor: 'cliente',
      reportId: registro.report_id,
      prazo: v.dataISO,
    });
  } catch {
    await reverterSugestaoParaSugerida(orgId, sugestaoId);
    return { ok: false, erro: 'falha_criar_tarefa' };
  }

  await setSugestaoTaskId(orgId, sugestaoId, taskId);
  return { ok: true };
}
