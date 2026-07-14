'use server';

import { revalidatePath } from 'next/cache';

import { logger } from '@/lib/logger';
import { setOrgAnalista } from '@/modules/analista/analista.repository';
import { requireAdmin } from '@/modules/auth/require-admin';
import {
  activateOrganization,
  getOrgConnectionHealth,
  getOrganizationById,
  isValidPlano,
  reactivateOrganization,
  requeueFailedReport,
  setPlano,
  suspendOrganization,
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

  const res = await requeueFailedReport({ reportId, actorUserId: admin.id });
  if (!res) return { error: 'Só relatórios com falha podem ser reprocessados.' };

  try {
    await dispatchPipelineRun(reportId);
  } catch (e) {
    await markReportFailed(reportId, 'dispatch_falhou');
    logger.error('dispatch do reprocesso falhou', { orgId: res.orgId, reportId }, e);
    return { error: 'Não foi possível disparar o pipeline. Tente novamente.' };
  }
  revalidatePath(`/admin/${res.orgId}`);
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
