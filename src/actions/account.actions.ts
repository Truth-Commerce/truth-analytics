'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { recordAudit } from '@/modules/audit/audit.repository';
import { hashPassword, verifyPassword } from '@/modules/auth/password';
import { invalidateUserResetTokens } from '@/modules/auth/password-reset.repository';
import { isTrocaSenhaRateLimited, recordAttempt } from '@/modules/auth/rate-limit';
import { requireActiveOrgParaMutacao } from '@/modules/auth/require-active-org';
import { getUserAuthById, setUserPasswordHash } from '@/modules/auth/user.repository';
import { sendPasswordChangedEmail } from '@/modules/notifications/email';
import { renameOrganization } from '@/modules/organizations/organization-settings.repository';

export type AccountState = { error?: string; ok?: boolean };

async function recordPasswordAttempt(input: {
  email: string;
  ip: string | null;
  success: boolean;
  userId: string;
}): Promise<void> {
  try {
    await recordAttempt({
      escopo: 'troca_senha',
      email: input.email,
      ip: input.ip,
      success: input.success,
    });
  } catch (error) {
    // Telemetria/rate-limit não pode transformar uma senha já alterada em
    // erro na UI. O alerta mantém a falha observável sem expor credenciais.
    logger.warn(
      'falha ao registrar tentativa de troca de senha',
      { userId: input.userId, success: input.success },
      error,
    );
  }
}

const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a sua senha atual.'),
    novaSenha: z.string().min(8, 'A nova senha precisa ter ao menos 8 caracteres.'),
    confirmarSenha: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((d) => d.novaSenha === d.confirmarSenha, {
    message: 'A confirmação não confere com a nova senha.',
    path: ['confirmarSenha'],
  });

export async function changePasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const access = await requireActiveOrgParaMutacao();
  const parsed = trocarSenhaSchema.safeParse({
    senhaAtual: formData.get('senhaAtual'),
    novaSenha: formData.get('novaSenha'),
    confirmarSenha: formData.get('confirmarSenha'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const user = await getUserAuthById(access.id);
  if (!user) return { error: 'Sessão inválida. Entre novamente.' };

  const forwarded = (await headers()).get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : null;

  if (await isTrocaSenhaRateLimited(user.email)) {
    return { error: 'Muitas tentativas. Tente novamente em alguns minutos.' };
  }

  const senhaOk = await verifyPassword(parsed.data.senhaAtual, user.senha_hash);
  if (!senhaOk) {
    await recordPasswordAttempt({ email: user.email, ip, success: false, userId: user.id });
    return { error: 'Senha atual incorreta.' };
  }

  const novoHash = await hashPassword(parsed.data.novaSenha);
  await setUserPasswordHash(user.id, novoHash);
  await invalidateUserResetTokens(user.id);
  await recordPasswordAttempt({ email: user.email, ip, success: true, userId: user.id });
  await recordAudit({ orgId: access.orgId, userId: user.id, acao: 'user.senha_alterada' });

  // Best-effort: sendEmail já nunca lança; o try é cinto-e-suspensório
  // (padrão de admin.actions.ts — e-mail nunca quebra o fluxo).
  try {
    await sendPasswordChangedEmail(user.email);
  } catch {
    /* best-effort */
  }
  return { ok: true };
}

const nomeEmpresaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe o nome da empresa.')
    .max(255, 'Nome longo demais (máx. 255 caracteres).'),
});

export async function updateOrgNameAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const access = await requireActiveOrgParaMutacao();
  const parsed = nomeEmpresaSchema.safeParse({ nome: formData.get('nome') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const resultado = await renameOrganization(access.orgId, parsed.data.nome);
  if (!resultado) return { error: 'Organização não encontrada.' };
  if (resultado.de !== parsed.data.nome) {
    await recordAudit({
      orgId: access.orgId,
      userId: access.id,
      acao: 'org.nome_alterado',
      detalhes: { de: resultado.de, para: parsed.data.nome },
    });
  }
  revalidatePath('/configuracoes');
  return { ok: true };
}
