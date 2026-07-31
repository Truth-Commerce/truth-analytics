import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Wiring do cron /api/cron/sincronizar-pedidos (unit, tudo mockado):
 * Passo 1 (renovação proativa) roda ANTES do Passo 2 (sync) e os contadores
 * {renovadas, expiradas, transientes} refletem o resultado de cada conexão.
 */

vi.mock('@/lib/env', () => ({
  serverEnv: { CRON_SECRET: 'cron-wiring-teste-16+++' },
}));

vi.mock('@/modules/connections/connection.repository', () => ({
  listConnectionsExpirando: vi.fn(),
}));

vi.mock('@/modules/connections/active-provider.repository', () => ({
  listActiveErpConnections: vi.fn(),
}));

vi.mock('@/modules/connections/token-renewal', () => ({
  MARGEM_RENOVACAO_MS: 24 * 60 * 60 * 1000,
  renovarConexaoDaOrg: vi.fn(),
}));

vi.mock('@/modules/pipeline/sync-pedidos', () => ({
  LOTE_MAXIMO_SYNC: 50,
  sincronizarPedidosDaOrg: vi.fn(),
}));

vi.mock('@/modules/admin/heartbeat.repository', () => ({ registrarHeartbeat: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

function req(auth?: string): Request {
  return new Request('http://localhost:3000/api/cron/sincronizar-pedidos', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe('cron sincronizar-pedidos — wiring do Passo 1 (renovação) + Passo 2 (sync)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renovação roda ANTES do sync e contadores renovadas/expiradas/transientes corretos', async () => {
    const active = await import('@/modules/connections/active-provider.repository');
    const repo = await import('@/modules/connections/connection.repository');
    const renewal = await import('@/modules/connections/token-renewal');
    const sync = await import('@/modules/pipeline/sync-pedidos');

    vi.mocked(repo.listConnectionsExpirando).mockResolvedValue(['org-a', 'org-b', 'org-c']);
    vi.mocked(active.listActiveErpConnections).mockResolvedValue([
      { orgId: 'org-a', provider: 'olist', sourceGeneration: 7, accountFingerprint: 'acct-a', lastSyncAt: null },
    ]);
    vi.mocked(renewal.renovarConexaoDaOrg)
      .mockResolvedValueOnce('renovada')
      .mockResolvedValueOnce('expirada')
      .mockResolvedValueOnce('transiente');
    vi.mocked(sync.sincronizarPedidosDaOrg).mockResolvedValue({
      processados: 3,
      total: 3,
      enriquecimento: { enriquecidos: 3, falhas: 0, quarentenados: 0, restantes: 0, incompleto: false },
    });

    const { GET } = await import('@/app/api/cron/sincronizar-pedidos/route');
    const res = await GET(req('Bearer cron-wiring-teste-16+++'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toMatchObject({
      orgs: 1,
      sincronizadas: 1,
      falhas: 0,
      renovadas: 1,
      expiradas: 1,
      transientes: 1,
    });

    // Passo 1 completo ANTES do Passo 2 (todas as renovações antes do 1º sync)
    const ordensRenovacao = vi.mocked(renewal.renovarConexaoDaOrg).mock.invocationCallOrder;
    const primeiraSync = vi.mocked(sync.sincronizarPedidosDaOrg).mock.invocationCallOrder[0];
    expect(ordensRenovacao).toHaveLength(3);
    expect(Math.max(...ordensRenovacao)).toBeLessThan(primeiraSync!);
    expect(sync.sincronizarPedidosDaOrg).toHaveBeenCalledWith(
      { orgId: 'org-a', provider: 'olist', sourceGeneration: 7, accountFingerprint: 'acct-a', lastSyncAt: null },
      expect.any(Date),
    );
    expect(active.listActiveErpConnections).toHaveBeenCalledWith({ limit: 50 });
    expect(json.porProvider).toEqual({ olist: { orgs: 1, sincronizadas: 1, falhas: 0 } });
  });

  it('falha transitória NÃO conta como expirada mesmo quando renovarConexaoDaOrg lança', async () => {
    const active = await import('@/modules/connections/active-provider.repository');
    const repo = await import('@/modules/connections/connection.repository');
    const renewal = await import('@/modules/connections/token-renewal');
    const sync = await import('@/modules/pipeline/sync-pedidos');

    vi.mocked(repo.listConnectionsExpirando).mockResolvedValue(['org-a']);
    vi.mocked(active.listActiveErpConnections).mockResolvedValue([]);
    vi.mocked(renewal.renovarConexaoDaOrg).mockRejectedValueOnce(new Error('boom-inesperado'));
    vi.mocked(sync.sincronizarPedidosDaOrg).mockResolvedValue({
      processados: 0,
      total: 0,
      enriquecimento: { enriquecidos: 0, falhas: 0, quarentenados: 0, restantes: 0, incompleto: false },
    });

    const { GET } = await import('@/app/api/cron/sincronizar-pedidos/route');
    const res = await GET(req('Bearer cron-wiring-teste-16+++'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.expiradas).toBe(0);
    expect(json.transientes).toBe(1);
    expect(json.renovadas).toBe(0);
  });

  it('isola a falha por org, respeita o lote e não expõe dados da conexão', async () => {
    const active = await import('@/modules/connections/active-provider.repository');
    const repo = await import('@/modules/connections/connection.repository');
    const sync = await import('@/modules/pipeline/sync-pedidos');
    vi.mocked(repo.listConnectionsExpirando).mockResolvedValue([]);
    vi.mocked(active.listActiveErpConnections).mockResolvedValue([
      { orgId: 'org-olist', provider: 'olist', sourceGeneration: 2, accountFingerprint: 'fingerprint', lastSyncAt: null },
      { orgId: 'org-bling', provider: 'bling', sourceGeneration: 1, accountFingerprint: null, lastSyncAt: null },
    ]);
    vi.mocked(sync.sincronizarPedidosDaOrg)
      .mockRejectedValueOnce(new Error('provider indisponível'))
      .mockResolvedValueOnce({ processados: 1, total: 1, enriquecimento: { enriquecidos: 0, falhas: 0, quarentenados: 0, restantes: 0, incompleto: false } });

    const { GET } = await import('@/app/api/cron/sincronizar-pedidos/route');
    const json = await (await GET(req('Bearer cron-wiring-teste-16+++'))).json();

    expect(json).toMatchObject({ orgs: 2, sincronizadas: 1, falhas: 1, porProvider: {
      olist: { orgs: 1, sincronizadas: 0, falhas: 1 }, bling: { orgs: 1, sincronizadas: 1, falhas: 0 },
    } });
    expect(JSON.stringify(json)).not.toContain('fingerprint');
  });
});
