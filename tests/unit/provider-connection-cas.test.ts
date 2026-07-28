import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, stored } = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), update: vi.fn() },
  stored: {
    id: 'connection-a',
    status: 'configurado',
    oauthClientId: 'cipher-client-id',
    oauthClientSecret: 'cipher-client-secret',
    accessToken: 'cipher-access-old',
    refreshToken: 'cipher-refresh-old',
    lastErrorCode: null as string | null,
  },
}));

vi.mock('@/db/client', () => ({ db: dbMock }));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit: vi.fn() }));
vi.mock('@/modules/connections/connection-secrets', () => ({
  decryptConnectionSecret: vi.fn(({ ciphertext }: { ciphertext: string }) => ciphertext),
  encryptConnectionSecret: vi.fn(
    ({ kind, value }: { kind: string; value: string }) => `cipher-${kind}-${value}`,
  ),
}));

import {
  getProviderRefreshContext,
  markProviderConnectionError,
  saveRefreshedProviderTokens,
} from '@/modules/connections/provider-connection.repository';

function currentRow() {
  return {
    id: stored.id,
    status: stored.status,
    oauthClientId: stored.oauthClientId,
    oauthClientSecret: stored.oauthClientSecret,
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    expiresAt: new Date('2026-07-28T12:30:00.000Z'),
  };
}

describe('provider connection refresh CAS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(stored, {
      status: 'configurado',
      oauthClientId: 'cipher-client-id',
      oauthClientSecret: 'cipher-client-secret',
      accessToken: 'cipher-access-old',
      refreshToken: 'cipher-refresh-old',
      lastErrorCode: null,
    });

    dbMock.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({ limit: async () => [currentRow()] }),
      }),
    }));

    dbMock.update.mockImplementation(() => ({
      set: (values: Record<string, unknown>) => ({
        where: (predicate: Parameters<PgDialect['sqlToQuery']>[0]) => ({
          returning: async () => {
            const query = new PgDialect().sqlToQuery(predicate);
            const requiresConfiguredStatus = query.sql.includes('"connections"."status" =');
            if (requiresConfiguredStatus && stored.status !== 'configurado') return [];

            if (typeof values.status === 'string') stored.status = values.status;
            if (typeof values.access_token === 'string') stored.accessToken = values.access_token;
            if (typeof values.refresh_token === 'string') stored.refreshToken = values.refresh_token;
            if (typeof values.last_error_code === 'string') {
              stored.lastErrorCode = values.last_error_code;
            } else if (values.last_error_code === null) {
              stored.lastErrorCode = null;
            }
            return [{ id: stored.id }];
          },
        }),
      }),
    }));
  });

  it('salva o refresh legítimo quando uma falha permanente da mesma versão marcou expirado antes', async () => {
    const context = await getProviderRefreshContext('org-a', 'olist');

    await expect(
      markProviderConnectionError({
        orgId: 'org-a',
        provider: 'olist',
        code: 'olist_refresh_invalido',
        permanent: true,
        expectedVersion: context.version,
      }),
    ).resolves.toBe(true);
    expect(stored.status).toBe('expirado');

    await expect(
      saveRefreshedProviderTokens({
        context,
        tokens: {
          accessToken: 'access-new',
          refreshToken: 'refresh-new',
          expiresInSeconds: 7_200,
        },
      }),
    ).resolves.toBe(true);
    expect(stored).toMatchObject({
      status: 'configurado',
      accessToken: 'cipher-access_token-access-new',
      refreshToken: 'cipher-refresh_token-refresh-new',
      lastErrorCode: null,
    });
  });

  it('deduplica duas falhas permanentes da mesma versão', async () => {
    const context = await getProviderRefreshContext('org-a', 'olist');
    const error = {
      orgId: 'org-a',
      provider: 'olist' as const,
      code: 'olist_refresh_invalido',
      permanent: true,
      expectedVersion: context.version,
    };

    await expect(markProviderConnectionError(error)).resolves.toBe(true);
    await expect(markProviderConnectionError(error)).resolves.toBe(false);
    expect(stored.status).toBe('expirado');
  });
});
