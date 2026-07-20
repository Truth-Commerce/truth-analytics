'use server';

import { randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { setOrgAnalista, transferCarteiraEmLote } from '@/modules/analista/analista.repository';
import { buildPasswordResetUrl, createPasswordResetToken } from '@/modules/auth/password-reset.repository';
import { requireAdmin } from '@/modules/auth/require-admin';
import {
  createOrgClientUser,
  createUserInOrg,
  getUserWithOrgById,
  normalizeEmail,
} from '@/modules/auth/user.repository';
import {
  activateOrganization,
  getOrgConnectionHealth,
  getOrganizationById,
  isValidPlano,
  reactivateOrganization,
  requeueFailedReport,
  setPlano,
  suspendOrganization,
  updateOrgNicho,
} from '@/modules/admin/admin.repository';
import { periodoDoPlano } from '@/modules/admin/periodo-plano';
import { recordAudit } from '@/modules/audit/audit.repository';
import { setMetaMensal } from '@/modules/organizations/organization-settings.repository';
import { dispatchPipelineRun } from '@/modules/pipeline/dispatch';
import { createQueuedReport, markReportFailed } from '@/modules/reports/report.repository';
import { sendAccountActivatedEmail } from '@/modules/notifications/email';
import { getOrgPrimaryEmail } from '@/modules/notifications/recipients';

export type AdminActionState = { error?: string; ok?: boolean };

export async function activateClientAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  const plano = formData.get('plano');
  if (!orgId) return { error: 'Cliente inválido.' };
  if (!isValidPlano(plano)) return { error: 'Selecione um plano válido.' };

  try {
    await activateOrganization({ orgId, plano, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'org_nao_modificavel') {
      return { error: 'Operação não permitida para esta organização.' };
    }
    throw e;
  }

  // Notificar cliente — best-effort: e-mail nunca quebra a ativação
  try {
    const to = await getOrgPrimaryEmail(orgId);
    if (to) await sendAccountActivatedEmail(to, plano);
  } catch (e) {
    // e-mail nunca quebra a ativação — apenas registra para observabilidade
    console.warn(
      '[email:activate] lookup/envio falhou: ' + (e instanceof Error ? e.message : String(e)),
    );
  }

  revalidatePath('/admin');
  return { ok: true };
}

export async function suspendClientAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  try {
    await suspendOrganization({ orgId, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'org_nao_modificavel') {
      return { error: 'Operação não permitida para esta organização.' };
    }
    throw e;
  }
  revalidatePath('/admin');
  return { ok: true };
}

export async function reactivateClientAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  try {
    await reactivateOrganization({ orgId, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'org_nao_modificavel') {
      return { error: 'Operação não permitida para esta organização.' };
    }
    throw e;
  }
  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Reprocessa (re-enfileira + dispara) um relatório com falha. Só admin.
 * O UPDATE em requeueFailedReport é restrito a status='failed'.
 */
export async function adminReprocessReportAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const reportId = String(formData.get('reportId') ?? '');
  if (!reportId) return { error: 'Relatório inválido.' };

  let res: { orgId: string } | null;
  try {
    res = await requeueFailedReport({ reportId, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'relatorio_em_andamento') {
      return { error: 'Já existe um relatório em andamento para este cliente. Aguarde ele terminar.' };
    }
    throw e;
  }
  if (!res) return { error: 'Só relatórios com falha podem ser reprocessados.' };

  try {
    await dispatchPipelineRun(reportId);
  } catch (e) {
    await markReportFailed(reportId, 'dispatch_falhou');
    logger.error('dispatch do reprocesso falhou', { orgId: res.orgId, reportId }, e);
    return { error: 'Não foi possível disparar o pipeline. Tente novamente.' };
  }
  revalidatePath(`/admin/${res.orgId}`);
  // A fila do centro de operações (H4 T10) também reprocessa relatórios failed daqui — revalida as duas telas.
  revalidatePath('/admin/operacoes');
  return { ok: true };
}

/**
 * Disparo manual do admin: gera um relatório para o cliente agora.
 * Exige org active + plano + Bling ok. Ignora o gate de ciclo (é disparo manual). Só admin.
 */
export async function adminGenerateReportAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };

  const org = await getOrganizationById(orgId);
  if (!org || org.status !== 'active') return { error: 'Organização não está ativa.' };
  if (!isValidPlano(org.plano)) return { error: 'Organização sem plano definido.' };

  const health = await getOrgConnectionHealth(orgId);
  if (health?.saude !== 'ok') return { error: 'Bling não está conectado para este cliente.' };

  const { inicio, fim } = periodoDoPlano(org.plano, new Date());
  let reportId: string;
  try {
    reportId = await createQueuedReport(orgId, { inicio, fim });
  } catch (e) {
    if (e instanceof Error && e.message === 'relatorio_em_andamento') {
      return { error: 'Já existe um relatório em andamento para este cliente.' };
    }
    throw e;
  }

  await recordAudit({
    orgId,
    userId: admin.id,
    acao: 'report.disparado_admin',
    detalhes: { reportId },
  });

  try {
    await dispatchPipelineRun(reportId);
  } catch (e) {
    await markReportFailed(reportId, 'dispatch_falhou');
    logger.error('dispatch do disparo manual falhou', { orgId, reportId }, e);
    return { error: 'Relatório enfileirado, mas o disparo falhou. Reprocesse na lista.' };
  }
  revalidatePath(`/admin/${orgId}`);
  return { ok: true };
}

export async function setPlanoAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  const plano = formData.get('plano');
  if (!orgId) return { error: 'Cliente inválido.' };
  if (!isValidPlano(plano)) return { error: 'Selecione um plano válido.' };
  try {
    await setPlano({ orgId, plano, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'org_nao_modificavel') {
      return { error: 'Operação não permitida para esta organização.' };
    }
    throw e;
  }
  revalidatePath('/admin');
  return { ok: true };
}

/** Só admin. Follow-up F2/F3c: liberar também para analista da carteira quando a role existir. */
export async function setMetaMensalAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  const raw = String(formData.get('meta') ?? '').trim().replace(',', '.');
  const meta = raw === '' ? null : Number(raw);
  if (!orgId) return { error: 'Cliente inválido.' };
  if (meta !== null && (!Number.isFinite(meta) || meta <= 0)) {
    return { error: 'Informe uma meta maior que zero.' };
  }
  await setMetaMensal(orgId, meta);
  await recordAudit({ orgId, userId: admin.id, acao: 'org.meta_alterada', detalhes: { meta } });
  revalidatePath(`/admin/${orgId}`);
  return { ok: true };
}

/** Só admin. Nicho (H3) — normalização (trim/''→null/cap 60) fica no repositório. */
export async function updateOrgNichoAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  const nicho = String(formData.get('nicho') ?? '');
  const nichoGravado = await updateOrgNicho(orgId, nicho);
  await recordAudit({
    orgId,
    userId: admin.id,
    acao: 'org.nicho_alterado',
    detalhes: { nicho: nichoGravado },
  });
  revalidatePath(`/admin/${orgId}`);
  return { ok: true };
}

export async function setOrgAnalistaAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  const analistaUserIdRaw = String(formData.get('analistaUserId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  const analistaUserId = analistaUserIdRaw === '' ? null : analistaUserIdRaw;
  try {
    await setOrgAnalista({ orgId, analistaUserId, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'analista_invalido') {
      return { error: 'Analista inválido.' };
    }
    throw e;
  }
  revalidatePath('/admin');
  revalidatePath(`/admin/${orgId}`);
  return { ok: true };
}

export type CriarUsuarioState = {
  error?: string;
  ok?: boolean;
  email?: string;
  senhaTemporaria?: string;
};

/**
 * Cria um usuário adicional (role client) para a org — fluxo do admin Truth.
 * A senha temporária é gerada aqui, devolvida SÓ no state (exibida uma vez)
 * e NUNCA vai para audit/log/e-mail.
 */
export async function adminCreateOrgUserAction(
  _prev: CriarUsuarioState,
  formData: FormData,
): Promise<CriarUsuarioState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  const parsed = z.string().trim().email('E-mail inválido.').safeParse(formData.get('email'));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'E-mail inválido.' };

  const org = await getOrganizationById(orgId);
  if (!org) return { error: 'Cliente inválido.' };

  const senhaTemporaria = randomBytes(9).toString('base64url'); // 12 chars
  try {
    const { userId } = await createOrgClientUser({ orgId, email: parsed.data, senha: senhaTemporaria });
    await recordAudit({
      orgId,
      userId: admin.id,
      acao: 'user.criado_admin',
      detalhes: { email: normalizeEmail(parsed.data), novoUserId: userId },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'email_em_uso') {
      return { error: 'Já existe uma conta com este e-mail.' };
    }
    if (e instanceof Error && e.message === 'limite_usuarios') {
      return { error: 'Limite de usuários desta organização atingido (máx. 3).' };
    }
    throw e;
  }
  revalidatePath(`/admin/${orgId}`);
  return { ok: true, email: normalizeEmail(parsed.data), senhaTemporaria };
}

// ---------------------------------------------------------------------------
// Gestão de contas cross-org (H4 T11) — /admin/usuarios.
// ---------------------------------------------------------------------------

const CriarUsuarioCrossOrgSchema = z.object({
  orgId: z.string().trim().min(1, 'Selecione uma organização.'),
  email: z.string().trim().email('E-mail inválido.'),
  // Só 'client' | 'analista' passam no zod — 'admin_truth' (ou qualquer outro
  // valor arbitrário de FormData) já cai fora aqui. `createUserInOrg` repete a
  // mesma checagem no repositório (defesa em profundidade: nenhum admin_truth
  // é criável por este caminho mesmo que a validação da action seja driblada).
  role: z.enum(['client', 'analista'], { errorMap: () => ({ message: 'Papel inválido.' }) }),
});

export type CriarUsuarioCrossOrgState = {
  error?: string;
  ok?: boolean;
  email?: string;
  senhaTemporaria?: string;
};

/**
 * Cria um usuário em QUALQUER org (client ou analista) — /admin/usuarios.
 * Mesmo modelo de segurança do `adminCreateOrgUserAction`: senha temporária
 * gerada aqui, devolvida só no state (exibida uma vez), nunca em audit/log.
 */
export async function adminCreateUserAction(
  _prev: CriarUsuarioCrossOrgState,
  formData: FormData,
): Promise<CriarUsuarioCrossOrgState> {
  const admin = await requireAdmin();
  const parsed = CriarUsuarioCrossOrgSchema.safeParse({
    orgId: formData.get('orgId'),
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { orgId, email, role } = parsed.data;

  const org = await getOrganizationById(orgId);
  if (!org) return { error: 'Organização inválida.' };

  const senhaTemporaria = randomBytes(9).toString('base64url'); // 12 chars
  try {
    const { userId } = await createUserInOrg({ orgId, email, role, senha: senhaTemporaria });
    await recordAudit({
      orgId,
      userId: admin.id,
      acao: 'user.criado_admin',
      detalhes: { email: normalizeEmail(email), novoUserId: userId, role },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'email_em_uso') {
      return { error: 'Já existe uma conta com este e-mail.' };
    }
    if (e instanceof Error && e.message === 'limite_usuarios') {
      return { error: 'Limite de usuários desta organização atingido (máx. 3).' };
    }
    if (e instanceof Error && e.message === 'role_invalida') {
      return { error: 'Papel inválido.' };
    }
    throw e;
  }
  revalidatePath('/admin/usuarios');
  return { ok: true, email: normalizeEmail(email), senhaTemporaria };
}

export type ResetLinkState = { error?: string; ok?: boolean; email?: string; link?: string };

/**
 * Gera o link de redefinição de senha (mesmo fluxo de "esqueci minha senha")
 * para o admin copiar e repassar ao cliente. NUNCA mostra/gera uma senha
 * diretamente — só o link de uso único (expira em 60min, ver
 * password-reset.repository.ts).
 */
export async function adminGenerateResetLinkAction(
  _prev: ResetLinkState,
  formData: FormData,
): Promise<ResetLinkState> {
  const admin = await requireAdmin();
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { error: 'Usuário inválido.' };

  const alvo = await getUserWithOrgById(userId);
  if (!alvo) return { error: 'Usuário inválido.' };

  const token = await createPasswordResetToken(alvo.email);
  if (!token) return { error: 'Não foi possível gerar o link.' };

  const link = buildPasswordResetUrl(token);

  // Audit registra QUEM foi alvo, nunca o token/link em claro.
  await recordAudit({
    orgId: alvo.orgId,
    userId: admin.id,
    acao: 'user.reset_link_gerado_admin',
    detalhes: { targetUserId: alvo.id },
  });

  return { ok: true, email: alvo.email, link };
}

export type TransferCarteiraState = { error?: string; ok?: boolean; count?: number };

/**
 * Transferência em lote da carteira: move TODAS as orgs do analista de
 * origem para o de destino. Decisão de audit (ver comentário em
 * `transferCarteiraEmLote`): 1 registro de audit por org, reaproveitando
 * `setOrgAnalista` — não um único audit "em lote".
 */
export async function adminTransferCarteiraAction(
  _prev: TransferCarteiraState,
  formData: FormData,
): Promise<TransferCarteiraState> {
  const admin = await requireAdmin();
  const origemAnalistaUserId = String(formData.get('origemAnalistaUserId') ?? '');
  const destinoAnalistaUserId = String(formData.get('destinoAnalistaUserId') ?? '');
  if (!origemAnalistaUserId || !destinoAnalistaUserId) {
    return { error: 'Selecione o analista de origem e o de destino.' };
  }
  if (origemAnalistaUserId === destinoAnalistaUserId) {
    return { error: 'Origem e destino precisam ser diferentes.' };
  }

  let orgIds: string[];
  try {
    ({ orgIds } = await transferCarteiraEmLote({
      origemAnalistaUserId,
      destinoAnalistaUserId,
      actorUserId: admin.id,
    }));
  } catch (e) {
    if (e instanceof Error && (e.message === 'analista_invalido' || e.message === 'origem_igual_destino')) {
      return { error: 'Selecione analistas válidos e diferentes.' };
    }
    throw e;
  }

  revalidatePath('/admin/usuarios');
  revalidatePath('/admin/performance');
  revalidatePath('/admin');
  return { ok: true, count: orgIds.length };
}
