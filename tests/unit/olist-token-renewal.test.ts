import { beforeEach, describe, expect, it, vi } from 'vitest';

const adapter = { refresh: vi.fn() };

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/modules/admin/admin.repository', () => ({ getOrganizationById: vi.fn() }));
vi.mock('@/modules/connections/olist-oauth-attempt', () => ({
  olistCallbackUri: vi.fn(() => 'https://app.example/api/connections/olist/callback'),
}));
vi.mock('@/modules/connections/provider-connection.repository', () => ({
  getProviderRefreshContext: vi.fn(),
  getValidAccessTokenForProvider: vi.fn(),
  markProviderConnectionError: vi.fn(),
  saveRefreshedProviderTokens: vi.fn(),
}));
vi.mock('@/modules/notifications/email', () => ({ sendOlistConnectionFailedEmail: vi.fn() }));
vi.mock('@/modules/notifications/notification.repository', () => ({ notify: vi.fn() }));
vi.mock('@/modules/notifications/recipients', () => ({
  getOrgAnalistaUser: vi.fn(async () => null),
  getOrgPrimaryUser: vi.fn(async () => null),
}));
vi.mock('@/modules/providers/oauth-registry', () => ({ getOAuthProvider: vi.fn(() => adapter) }));

import {
  getProviderRefreshContext,
  markProviderConnectionError,
  saveRefreshedProviderTokens,
} from '@/modules/connections/provider-connection.repository';
import { renewOlistConnection } from '@/modules/connections/olist-token-renewal';
import { OAuthProviderError } from '@/modules/providers/oauth.types';

describe('renewOlistConnection — códigos seguros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProviderRefreshContext).mockResolvedValue({
      orgId: 'org-a',
      provider: 'olist',
      status: 'configurado',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-secret',
      expiresAt: new Date('2026-07-28T12:30:00.000Z'),
      version: 'version-a',
    });
    vi.mocked(markProviderConnectionError).mockResolvedValue(true);
  });

  it('normaliza falha permanente sem persistir mensagem do provider', async () => {
    adapter.refresh.mockRejectedValueOnce(
      new OAuthProviderError('remote-invalid-grant-detail', 'permanent'),
    );
    await expect(
      renewOlistConnection('org-a', new Date('2026-07-28T12:00:00.000Z')),
    ).resolves.toBe('expired');
    expect(markProviderConnectionError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'olist_refresh_invalido', permanent: true }),
    );
    expect(JSON.stringify(vi.mocked(markProviderConnectionError).mock.calls)).not.toContain(
      'remote-invalid-grant-detail',
    );
  });

  it('normaliza falha transitória desconhecida', async () => {
    adapter.refresh.mockRejectedValueOnce(new Error('remote-body-and-secret'));
    await expect(
      renewOlistConnection('org-a', new Date('2026-07-28T12:00:00.000Z')),
    ).resolves.toBe('transient');
    expect(markProviderConnectionError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'olist_refresh_transiente', permanent: false }),
    );
  });

  it('não persiste refresh quando o sinal é abortado antes do CAS', async () => {
    const controller = new AbortController();
    adapter.refresh.mockImplementationOnce(async () => {
      controller.abort();
      return { accessToken: 'new', refreshToken: 'new-refresh', expiresInSeconds: 3600 };
    });

    await expect(renewOlistConnection('org-a', new Date(), { signal: controller.signal })).resolves.toBe('transient');
    expect(saveRefreshedProviderTokens).not.toHaveBeenCalled();
    expect(markProviderConnectionError).not.toHaveBeenCalled();
  });

  it('entrega o lifecycle ao CAS de refresh, sem uma race que deixe save em segundo plano', async () => {
    const controller = new AbortController();
    adapter.refresh.mockResolvedValueOnce({ accessToken: 'new', refreshToken: 'new-refresh', expiresInSeconds: 3600 });
    vi.mocked(saveRefreshedProviderTokens).mockResolvedValueOnce(true);

    await expect(renewOlistConnection('org-a', new Date(), { signal: controller.signal, deadlineAt: Date.now() + 5_000 })).resolves.toBe('renewed');

    expect(saveRefreshedProviderTokens).toHaveBeenCalledWith(expect.objectContaining({
      lifecycle: expect.objectContaining({ signal: controller.signal, deadlineAt: expect.any(Number) }),
    }));
  });
});
