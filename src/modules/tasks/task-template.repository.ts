import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { taskTemplates } from '@/db/schema';
import type { TaskTipo } from './task.types';

/**
 * Repositório de templates de task ("playbooks"). Templates são GLOBAIS
 * (sem org_id) — usados por `createTaskAction` (Task 7) e pela UI do
 * analista (Task 11) para pré-preencher uma nova task, e administrados pela
 * UI admin de playbooks (Task 12), que também é dona do teste de integração
 * deste repositório (`tests/integration/task-template-repository.test.ts`).
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

// ---------------------------------------------------------------------------
// Lado-ESCRITA (Task 12) — administrado só pela UI admin de playbooks.
// ---------------------------------------------------------------------------

export async function createTemplate(input: {
  titulo: string;
  tipo: TaskTipo;
  descricao?: string;
  checklist: string[];
}): Promise<string> {
  const [row] = await db
    .insert(taskTemplates)
    .values({
      titulo: input.titulo,
      tipo: input.tipo,
      descricao: input.descricao ?? '',
      checklist: input.checklist,
    })
    .returning({ id: taskTemplates.id });
  return row!.id;
}

export async function updateTemplate(
  id: string,
  patch: Partial<{ titulo: string; tipo: TaskTipo; descricao: string; checklist: string[] }>,
): Promise<void> {
  const set: Partial<typeof taskTemplates.$inferInsert> = {};
  if (patch.titulo !== undefined) set.titulo = patch.titulo;
  if (patch.tipo !== undefined) set.tipo = patch.tipo;
  if (patch.descricao !== undefined) set.descricao = patch.descricao;
  if (patch.checklist !== undefined) set.checklist = patch.checklist;
  if (Object.keys(set).length === 0) return;
  await db.update(taskTemplates).set(set).where(eq(taskTemplates.id, id));
}

export async function setTemplateAtivo(id: string, ativo: boolean): Promise<void> {
  await db.update(taskTemplates).set({ ativo }).where(eq(taskTemplates.id, id));
}
