'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { recordAudit } from '@/modules/audit/audit.repository';
import { requireAdmin } from '@/modules/auth/require-admin';
import { createTemplate, setTemplateAtivo, updateTemplate } from '@/modules/tasks/task-template.repository';
import { TASK_PRIORIDADES, TASK_TIPOS } from '@/modules/tasks/task.types';

export type TemplateActionState = { error?: string; ok?: boolean };

// checklist chega como textarea (1 item por linha) — linhas em branco são
// descartadas.
function parseChecklist(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? '')
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);
}

const templateSchema = z.object({
  titulo: z.string().trim().min(3).max(200),
  tipo: z.enum(TASK_TIPOS),
  descricao: z.string().max(5000).optional().default(''),
  prioridade: z.enum(TASK_PRIORIDADES).default('media'),
  prazoDias: z.coerce.number().int().min(1).max(365).optional(),
});

export async function createTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const admin = await requireAdmin();

  const parsed = templateSchema.safeParse({
    titulo: formData.get('titulo'),
    tipo: formData.get('tipo'),
    descricao: formData.get('descricao') ?? '',
    prioridade: formData.get('prioridade') ?? undefined,
    prazoDias: formData.get('prazoDias') || undefined,
  });
  if (!parsed.success) return { error: 'Dados inválidos. Confira os campos e tente novamente.' };
  const checklist = parseChecklist(formData.get('checklist'));

  const templateId = await createTemplate({
    ...parsed.data,
    prazoDias: parsed.data.prazoDias ?? null,
    checklist,
  });

  await recordAudit({
    userId: admin.id,
    acao: 'template.criado',
    detalhes: { templateId, titulo: parsed.data.titulo },
  });

  revalidatePath('/admin/playbooks');
  return { ok: true };
}

const updateTemplateSchema = templateSchema.extend({ id: z.string().min(1) });

export async function updateTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const admin = await requireAdmin();

  const parsed = updateTemplateSchema.safeParse({
    id: formData.get('id'),
    titulo: formData.get('titulo'),
    tipo: formData.get('tipo'),
    descricao: formData.get('descricao') ?? '',
    prioridade: formData.get('prioridade') ?? undefined,
    prazoDias: formData.get('prazoDias') || undefined,
  });
  if (!parsed.success) return { error: 'Dados inválidos. Confira os campos e tente novamente.' };
  const { id, titulo, tipo, descricao, prioridade, prazoDias } = parsed.data;
  const checklist = parseChecklist(formData.get('checklist'));

  await updateTemplate(id, { titulo, tipo, descricao, checklist, prioridade, prazoDias: prazoDias ?? null });

  await recordAudit({ userId: admin.id, acao: 'template.editado', detalhes: { templateId: id, titulo } });

  revalidatePath('/admin/playbooks');
  return { ok: true };
}

export async function toggleTemplateAtivoAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const ativo = formData.get('ativo') === 'true';

  await setTemplateAtivo(id, ativo);

  await recordAudit({ userId: admin.id, acao: 'template.ativo_alterado', detalhes: { templateId: id, ativo } });

  revalidatePath('/admin/playbooks');
}
