import { logger } from '@/lib/logger';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { olistCallbackUri } from '@/modules/connections/olist-oauth-attempt';
import {
  getProviderRefreshContext,
  getValidAccessTokenForProvider,
  markProviderConnectionError,
  saveRefreshedProviderTokens,
} from '@/modules/connections/provider-connection.repository';
import { sendOlistConnectionFailedEmail } from '@/modules/notifications/email';
import { notify } from '@/modules/notifications/notification.repository';
import { getOrgAnalistaUser, getOrgPrimaryUser } from '@/modules/notifications/recipients';
import { getOAuthProvider } from '@/modules/providers/oauth-registry';
import { OAuthProviderError } from '@/modules/providers/oauth.types';

export const OLIST_REFRESH_MARGIN_MS = 10_800_000;
export const OLIST_REFRESH_BATCH = 50;

export type OlistRenewalResult = 'renewed' | 'expired' | 'transient' | 'won-by-peer';
type RenewalOptions = { force?: boolean; signal?: AbortSignal; deadlineAt?: number };

export async function renewOlistConnection(
  orgId: string,
  now: Date = new Date(),
  options: RenewalOptions = {},
): Promise<OlistRenewalResult> {
  ensureActive(options);
  const context = await abortable(getProviderRefreshContext(orgId, 'olist'), options);
  if (!options.force && context.expiresAt.getTime() - now.getTime() > OLIST_REFRESH_MARGIN_MS) {
    return 'renewed';
  }

  try {
    const tokens = await abortable(getOAuthProvider('olist').refresh({
      credentials: {
        clientId: context.clientId,
        clientSecret: context.clientSecret,
        redirectUri: olistCallbackUri(),
      },
      refreshToken: context.refreshToken,
      signal: options.signal,
      deadlineAt: options.deadlineAt,
    }), options);
    ensureActive(options);
    const saved = await abortable(saveRefreshedProviderTokens({ context, tokens, now }), options);
    if (!saved) {
      await confirmPeerUpdate(orgId);
      return 'won-by-peer';
    }
    return 'renewed';
  } catch (error) {
    if (isInactive(options)) return 'transient';
    const permanent = error instanceof OAuthProviderError && error.kind === 'permanent';
    const code = permanent ? 'olist_refresh_invalido' : 'olist_refresh_transiente';
    ensureActive(options);
    const marked = await abortable(markProviderConnectionError({
      orgId,
      provider: 'olist',
      code,
      permanent,
      expectedVersion: context.version,
      now,
    }), options);
    if (!marked) {
      await confirmPeerUpdate(orgId);
      return 'won-by-peer';
    }
    if (!permanent) return 'transient';
    ensureActive(options);
    await abortable(notifyOlistConnectionExpired(orgId), options);
    return 'expired';
  }
}

function isInactive(options: RenewalOptions): boolean {
  return Boolean(options.signal?.aborted || (options.deadlineAt !== undefined && options.deadlineAt <= Date.now()));
}

function ensureActive(options: RenewalOptions): void {
  if (isInactive(options)) throw new OAuthProviderError('olist_token_erro_transiente', 'transient');
}

function abortable<T>(promise: Promise<T>, options: RenewalOptions): Promise<T> {
  ensureActive(options);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new OAuthProviderError('olist_token_erro_transiente', 'transient'));
    };
    const timer = options.deadlineAt === undefined
      ? undefined
      : setTimeout(abort, Math.max(0, options.deadlineAt - Date.now()));
    options.signal?.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); if (isInactive(options)) abort(); else resolve(value); },
      (error) => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); reject(error); },
    );
  });
}

async function confirmPeerUpdate(orgId: string): Promise<void> {
  try {
    await getValidAccessTokenForProvider(orgId, 'olist', 0);
  } catch {
    // A perda do CAS já prova que outra escrita venceu (troca, refresh ou desconexão).
    // A releitura é deliberada, mas o vencedor continua soberano mesmo sem token válido.
  }
}

async function notifyOlistConnectionExpired(orgId: string): Promise<void> {
  try {
    const [client, analyst, organization] = await Promise.all([
      getOrgPrimaryUser(orgId),
      getOrgAnalistaUser(orgId),
      getOrganizationById(orgId),
    ]);
    if (client) {
      await Promise.all([
        notify(client.id, {
          tipo: 'conexao_expirada',
          titulo: 'Sua conexão com o Olist expirou',
          corpo: 'Autorize novamente o Olist para manter a conexão pronta para as próximas integrações.',
          href: '/conexoes',
        }),
        sendOlistConnectionFailedEmail(client.email, '/conexoes'),
      ]);
    }
    if (analyst) {
      const href = `/analista/${orgId}?tab=conexao`;
      await Promise.all([
        notify(analyst.id, {
          tipo: 'conexao_expirada',
          titulo: 'Conexão Olist de um cliente expirou',
          corpo: `A conexão Olist de ${organization?.name ?? 'um cliente da sua carteira'} precisa ser autorizada novamente.`,
          href,
        }),
        sendOlistConnectionFailedEmail(analyst.email, href),
      ]);
    }
  } catch {
    logger.warn('olist_token_renewal.notification_failed', { orgId });
  }
}
