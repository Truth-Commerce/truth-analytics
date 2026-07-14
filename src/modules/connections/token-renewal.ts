import { logger } from '@/lib/logger';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { getValidAccessToken } from '@/modules/connections/connection.repository';
import { notify } from '@/modules/notifications/notification.repository';
import { getOrgAnalistaUser, getOrgPrimaryUser } from '@/modules/notifications/recipients';

/** Tokens Bling expirando em até 24h são renovados proativamente pelo cron. */
export const MARGEM_RENOVACAO_MS = 24 * 60 * 60 * 1000;

/**
 * Renova o token Bling de UMA org (reusa o refresh de getValidAccessToken com
 * margem de 24h). Em falha, o repositório JÁ marcou status='expirado' e
 * enviou o e-mail ao cliente — aqui somamos as notificações in-app (cliente +
 * analista da carteira), best-effort. Como a conexão sai de 'ok', ela não é
 * re-selecionada amanhã → o aviso sai UMA vez, sem spam.
 */
export async function renovarConexaoDaOrg(orgId: string): Promise<'renovada' | 'expirada'> {
  try {
    await getValidAccessToken(orgId, MARGEM_RENOVACAO_MS);
    return 'renovada';
  } catch (err) {
    logger.warn('token_renewal.refresh_falhou', {
      orgId,
      erro: err instanceof Error ? err.message : String(err),
    });
    await notificarConexaoExpirada(orgId);
    return 'expirada';
  }
}

/** Notificação in-app de conexão expirada (cliente + analista). Nunca lança. */
async function notificarConexaoExpirada(orgId: string): Promise<void> {
  try {
    const [user, analista, org] = await Promise.all([
      getOrgPrimaryUser(orgId),
      getOrgAnalistaUser(orgId),
      getOrganizationById(orgId),
    ]);
    if (user) {
      await notify(user.id, {
        tipo: 'conexao_expirada',
        titulo: 'Sua conexão com o Bling expirou',
        corpo:
          'Seus dados de vendas pararam de atualizar. Reconecte o Bling em Conexões para continuar recebendo análises e alertas.',
        href: '/conexoes',
      });
    }
    if (analista) {
      await notify(analista.id, {
        tipo: 'conexao_expirada',
        titulo: 'Conexão Bling de um cliente expirou',
        corpo: `A conexão Bling de ${org?.name ?? 'um cliente da sua carteira'} expirou. Oriente o cliente a reconectar em Conexões.`,
        href: '/analista',
      });
    }
  } catch (err) {
    logger.warn('token_renewal.notificacao_falhou', {
      orgId,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
}
