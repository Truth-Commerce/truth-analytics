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
  listOrgsComBlingOk: vi.fn(),
}));

vi.mock('@/modules/connections/token-renewal', () => ({
  MARGEM_RENOVACAO_MS: 24 * 60 * 60 * 1000,
  renovarConexaoDaOrg: vi.fn(),
}));

vi.mock('@/modules/pipeline/sync-pedidos', () => ({
  LOTE_MAXIMO_SYNC: 50,
  sincronizarPedidosDaOrg: vi.fn(),
}));

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
    const repo = await import('@/modules/connections/connection.repository');
    const renewal = await import('@/modules/connections/token-renewal');
    const sync = await import('@/modules/pipeline/sync-pedidos');

    vi.mocked(repo.listConnectionsExpirando).mockResolvedValue(['org-a', 'org-b', 'org-c']);
    vi.mocked(repo.listOrgsComBlingOk).mockResolvedValue(['org-a']);
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
      { orgId: 'org-a', provider: 'bling', sourceGeneration: 1 },
      expect.any(Date),
    );
  });

  it('falha transitória NÃO conta como expirada mesmo quando renovarConexaoDaOrg lança', async () => {
    const repo = await import('@/modules/connections/connection.repository');
    const renewal = await import('@/modules/connections/token-renewal');
    const sync = await import('@/modules/pipeline/sync-pedidos');

    vi.mocked(repo.listConnectionsExpirando).mockResolvedValue(['org-a']);
    vi.mocked(repo.listOrgsComBlingOk).mockResolvedValue([]);
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
});
