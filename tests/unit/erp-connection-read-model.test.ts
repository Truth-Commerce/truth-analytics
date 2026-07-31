import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, reconcileOrderReadiness } = vi.hoisted(() => ({
  dbMock: { select: vi.fn() },
  reconcileOrderReadiness: vi.fn(),
}));

vi.mock('@/db/client', () => ({ db: dbMock }));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit: vi.fn() }));
vi.mock('@/modules/connections/connection-secrets', () => ({
  decryptConnectionSecret: vi.fn(),
  encryptConnectionSecret: vi.fn(),
}));
vi.mock('@/modules/pipeline/order-reconciliation', () => ({ reconcileOrderReadiness }));

import { getErpConnectionReadModel } from '@/modules/connections/provider-connection.repository';

const readyCursor = {
  version: 1,
  stage: 'ready',
  sourceGeneration: 3,
  accountFingerprint: 'a'.repeat(64),
  window: { from: '2026-05-01T00:00:00.000Z', to: '2026-07-30T00:00:00.000Z' },
  catchUpFrom: '2026-07-30T00:00:00.000Z',
  snapshot: { done: true },
  catchup: { done: true, completedAt: '2026-07-30T01:00:00.000Z' },
  verify1: {
    done: true,
    expectedCount: 42,
    checksum: '1'.repeat(32),
    dailyChecksum: '2'.repeat(32),
    channelChecksum: '3'.repeat(32),
  },
  verify2: {
    done: true,
    expectedCount: 42,
    checksum: '1'.repeat(32),
    dailyChecksum: '2'.repeat(32),
    channelChecksum: '3'.repeat(32),
  },
  progress: null,
};

function summaryQuery(row: Record<string, unknown>) {
  return { from: () => ({ where: () => ({ limit: async () => [row] }) }) };
}

describe('ERP connection read model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select
      .mockReturnValueOnce(summaryQuery({
        status: 'ok',
        oauthClientId: 'cipher-bling-client',
        oauthClientSecret: 'cipher-bling-secret',
        accessToken: 'cipher-bling-access',
        refreshToken: 'cipher-bling-refresh',
        expiresAt: null,
        refreshExpiresAt: null,
        lastRefreshAt: null,
        lastSyncAt: new Date('2026-07-30T11:00:00.000Z'),
        lastErrorCode: null,
      }))
      .mockReturnValueOnce(summaryQuery({
        status: 'configurado',
        oauthClientId: 'cipher-olist-client',
        oauthClientSecret: 'cipher-olist-secret',
        accessToken: 'cipher-olist-access',
        refreshToken: 'cipher-olist-refresh',
        expiresAt: null,
        refreshExpiresAt: null,
        lastRefreshAt: null,
        lastSyncAt: new Date('2026-07-30T12:00:00.000Z'),
        lastErrorCode: null,
      }))
      .mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: async () => [{
                sourceGeneration: 3,
                accountFingerprint: 'a'.repeat(64),
                cursor: readyCursor,
                processedCount: 42,
                backlogCount: 0,
              }],
            }),
          }),
        }),
      });
    reconcileOrderReadiness.mockResolvedValue({
      ready: true,
      reasons: [],
      expectedCount: 42,
      actualCount: 42,
      pendingDetails: 0,
      quarantined: 0,
    });
  });

  it('entrega apenas estado operacional e progresso, sem credenciais nem tokens', async () => {
    const model = await getErpConnectionReadModel('org-a');

    expect(model).toEqual({
      activeProvider: 'bling',
      bling: {
        authorized: true,
        operational: true,
        lastSuccessfulSyncAt: new Date('2026-07-30T11:00:00.000Z'),
      },
      olist: {
        provider: 'olist',
        status: 'configurado',
        credentialsConfigured: true,
        authorized: true,
        operational: false,
        expiresAt: null,
        refreshExpiresAt: null,
        lastRefreshAt: null,
        lastSyncAt: new Date('2026-07-30T12:00:00.000Z'),
        lastErrorCode: null,
      },
      preparation: {
        stage: 'ready',
        ready: true,
        expectedCount: 42,
        persistedCount: 42,
        pendingDetails: 0,
        quarantinedDetails: 0,
        processedCount: 42,
        backlogCount: 0,
      },
    });
    expect(JSON.stringify(model)).not.toMatch(/cipher|access_token|refresh_token|oauth_client/);
  });
});
