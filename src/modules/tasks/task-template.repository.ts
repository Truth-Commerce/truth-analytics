import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { taskTemplates } from '@/db/schema';
import type { TaskTipo } from './task.types';

/**
 * Lado-LEITURA do repositório de templates de task. Templates são GLOBAIS
 * (sem org_id) — usados por `createTaskAction` (Task 7) e pela UI do
 * analista (Task 11) para pré-preencher uma nova task.
 *
 * O lado-ESCRITA (createTemplate/updateTemplate/setTemplateAtivo) é
 * implementado na Task 12 (UI admin de playbooks), que também vai adicionar
 * o teste de integração deste repositório. Não duplicar aqui.
 */
export type TaskTemplate = {
  id: string;
  titulo: string;
  tipo: TaskTipo;
  descricao: string;
  checklist: string[];
  ativo: boolean;
};

// checklist é jsonb — nunca confiar no shape vindo do banco (coluna pode ter
// sido escrita por um caminho legado ou corrompida); `.catch([])` garante que
// o repositório de leitura nunca lança por causa disso.
const checklistSchema = z.array(z.string()).catch([]);

function rowToTemplate(row: typeof taskTemplates.$inferSelect): TaskTemplate {
  return {
    id: row.id,
    titulo: row.titulo,
    tipo: row.tipo as TaskTipo,
    descricao: row.descricao,
    checklist: checklistSchema.parse(row.checklist),
    ativo: row.ativo,
  };
}

export async function getTemplateById(id: string): Promise<TaskTemplate | null> {
  const [row] = await db.select().from(taskTemplates).where(eq(taskTemplates.id, id)).limit(1);
  return row ? rowToTemplate(row) : null;
}

export async function listTemplates(soAtivos = false): Promise<TaskTemplate[]> {
  const rows = soAtivos
    ? await db.select().from(taskTemplates).where(eq(taskTemplates.ativo, true))
    : await db.select().from(taskTemplates);
  return rows.map(rowToTemplate);
}
