'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { isDataCalendarioValida } from '@/lib/timezone';
import { requireActiveOrgParaMutacao } from '@/modules/auth/require-active-org';
import { ativarCiclo, criarCiclo, fecharCiclo } from '@/modules/tasks/cycle.repository';

// ---------------------------------------------------------------------------
// Guard de mutação (H5/T9). Estas actions são ORG-scoped (criar/ativar/fechar
// um ciclo não é uma operação sobre uma task específica) — diferente de
// `moverTaskParaCicloAction` em tasks.actions.ts, que É task-scoped e por
// isso roteia por `resolveTaskContext` (1ª linha `assertNaoImpersonando`,
// exigido porque aquele módulo resolve sessão via `requireSession` direto,
// cego ao cookie de impersonação por padrão).
//
// Aqui, `requireActiveOrgParaMutacao()` JÁ cobre a invariante "impersonação é
// read-only": por baixo ele chama `requireActiveOrg()` e lança
// 'Modo visualização: ações desabilitadas' sempre que `access.impersonadoPor`
// está presente (ver require-active-org.ts). Nenhuma outra action org-scoped
// do projeto (reports/connections/account/alerts.actions.ts) empilha um
// `assertNaoImpersonando()` redundante por cima disso — seguimos o mesmo
// padrão estabelecido em vez de duplicar o guard.
// ---------------------------------------------------------------------------

export type CycleActionState = { error?: string; ok?: boolean; cycleId?: string };

// Mesmo padrão de tasks.actions.ts (prazoDate): regex garante o FORMATO,
// refine garante que é uma data REAL. União com '' porque início/fim são
// opcionais no form (ciclo pode nascer sem datas — só ganha burndown quando
// as duas forem definidas).
const dateOrEmpty = z.union([
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isDataCalendarioValida, { message: 'data_invalida' }),
  z.literal(''),
]);

const criarCicloSchema = z
  .object({
    nome: z.string().trim().min(3).max(120),
    inicio: dateOrEmpty.optional().default(''),
    fim: dateOrEmpty.optional().default(''),
  })
  .refine((v) => !v.inicio || !v.fim || v.fim >= v.inicio, {
    message: 'periodo_invalido',
    path: ['fim'],
  });

export async function criarCicloAction(_prev: CycleActionState, formData: FormData): Promise<CycleActionState> {
  const access = await requireActiveOrgParaMutacao();

  const parsed = criarCicloSchema.safeParse({
    nome: formData.get('nome'),
    inicio: formData.get('inicio') ?? '',
    fim: formData.get('fim') ?? '',
  });
  if (!parsed.success) return { error: 'Dados inválidos. Confira o nome e o período (fim não pode vir antes do início).' };
  const { nome, inicio, fim } = parsed.data;

  const cycleId = await criarCiclo(access.orgId, { nome, inicio: inicio || null, fim: fim || null });

  revalidatePath('/dashboard/plano-de-acao/ciclos');
  return { ok: true, cycleId };
}

const cycleIdSchema = z.object({ cycleId: z.string().min(1) });

/** Ativa um ciclo 'planejado' (-> 'ativo'). Ver `ativarCiclo` (cycle.repository) pras regras de transição. */
export async function ativarCicloAction(formData: FormData): Promise<CycleActionState> {
  const access = await requireActiveOrgParaMutacao();

  const parsed = cycleIdSchema.safeParse({ cycleId: formData.get('cycleId') });
  if (!parsed.success) return { error: 'Dados inválidos. Tente novamente.' };

  try {
    await ativarCiclo(access.orgId, parsed.data.cycleId);
  } catch (e) {
    if (e instanceof Error && e.message === 'ciclo_nao_encontrado') return { error: 'Ciclo não encontrado.' };
    if (e instanceof Error && e.message === 'transicao_invalida') {
      return { error: 'Só é possível ativar um ciclo planejado.' };
    }
    throw e;
  }

  revalidatePath('/dashboard/plano-de-acao/ciclos');
  return { ok: true };
}

/** Fecha um ciclo (-> 'fechado') — irreversível (nenhum ciclo fechado reabre). */
export async function fecharCicloAction(formData: FormData): Promise<CycleActionState> {
  const access = await requireActiveOrgParaMutacao();

  const parsed = cycleIdSchema.safeParse({ cycleId: formData.get('cycleId') });
  if (!parsed.success) return { error: 'Dados inválidos. Tente novamente.' };

  try {
    await fecharCiclo(access.orgId, parsed.data.cycleId);
  } catch (e) {
    if (e instanceof Error && e.message === 'ciclo_nao_encontrado') return { error: 'Ciclo não encontrado.' };
    throw e;
  }

  revalidatePath('/dashboard/plano-de-acao/ciclos');
  return { ok: true };
}
