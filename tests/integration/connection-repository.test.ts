import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connections, organizations, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

// ─── Suite 1: testes base (tokens, refresh, sem conexão) ───────────────────
describe.skipIf(!url)('connection.repository — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);
  let orgId = '';

  beforeAll(async () => {
    const [o] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-conn-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = o.id;
  });

  afterAll(async () => {
    await tdb.delete(connections).where(eq(connections.org_id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('salva tokens cifrados (não em texto puro) e lê token válido', async () => {
    const { saveBlingConnection, getValidAccessToken } = await import(
      '@/modules/connections/connection.repository'
    );
    await saveBlingConnection(orgId, {
      accessToken: 'ACCESS-puro',
      refreshToken: 'REFRESH-puro',
      expiresInSeconds: 3600,
    });
    const [row] = await tdb
      .select()
      .from(connections)
      .where(eq(connections.org_id, orgId))
      .limit(1);
    expect(row.access_token).not.toContain('ACCESS-puro'); // cifrado
    expect(row.refresh_token).not.toContain('REFRESH-puro'); // cifrado
    expect(row.status).toBe('ok');
    // token ainda válido (1h) → retorna sem refresh
    expect(await getValidAccessToken(orgId)).toBe('ACCESS-puro');
  });

  it('faz refresh quando próximo de expirar', async () => {
    // expira já (0s) → força refresh
    const repo = await import('@/modules/connections/connection.repository');
    await repo.saveBlingConnection(orgId, {
      accessToken: 'velho',
      refreshToken: 'refresh-velho',
      expiresInSeconds: 0,
    });
    // mocka o provider.refresh — spy no mesmo objeto que o repository importou
    const provider = await import('@/modules/providers/bling/provider');
    vi.spyOn(provider.blingProvider, 'refresh').mockResolvedValueOnce({
      accessToken: 'novo',
      refreshToken: 'refresh-novo',
      expiresInSeconds: 3600,
    });
    expect(await repo.getValidAccessToken(orgId)).toBe('novo');
  });

  it('lança sem_conexao_bling quando não há conexão', async () => {
    const repo = await import('@/modules/connections/connection.repository');
    await expect(repo.getValidAccessToken('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      'sem_conexao_bling',
    );
  });
});

// ─── Suite 2: notificação de falha de refresh (org e user dedicados) ────────
describe.skipIf(!url)('connection.repository — notificação de falha de refresh', () => {
  const sql2 = postgres(url ?? '', { prepare: false });
  const tdb2 = drizzle(sql2);
  let notifyOrgId = '';
  let notifyUserId = '';
  const CLIENT_EMAIL = `ta-test-notify-${RUN}@example.com`;

  beforeAll(async () => {
    const [o] = await tdb2
      .insert(organizations)
      .values({ name: `ta-test-conn-notify-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    notifyOrgId = o.id;

    const [u] = await tdb2
      .insert(users)
      .values({
        org_id: notifyOrgId,
        email: CLIENT_EMAIL,
        senha_hash: 'hash-placeholder',
        role: 'client',
      })
      .returning({ id: users.id });
    notifyUserId = u.id;
  });

  afterAll(async () => {
    await tdb2.delete(connections).where(eq(connections.org_id, notifyOrgId));
    await tdb2.delete(users).where(eq(users.id, notifyUserId));
    await tdb2.delete(organizations).where(eq(organizations.id, notifyOrgId));
    await sql2.end();
  });

  it('falha PERMANENTE de refresh (bling_refresh_invalido) → status expirado + notifica cliente', async () => {
    const repo = await import('@/modules/connections/connection.repository');
    const provider = await import('@/modules/providers/bling/provider');
    const emailMod = await import('@/modules/notifications/email');

    // Seed: conexão com tokens expirados (força refresh)
    await repo.saveBlingConnection(notifyOrgId, {
      accessToken: 'velho',
      refreshToken: 'refresh-velho',
      expiresInSeconds: 0,
    });

    // Spy: refresh falha PERMANENTE (400/401 classificado pelo oauth.ts)
    vi.spyOn(provider.blingProvider, 'refresh').mockRejectedValueOnce(
      new Error('bling_refresh_invalido'),
    );
    // Spy: captura chamada de e-mail (live binding ESM — mesmo padrão do blingProvider)
    const emailSpy = vi
      .spyOn(emailMod, 'sendBlingConnectionFailedEmail')
      .mockResolvedValueOnce(undefined);

    // Ação: deve rejeitar com refresh_bling_falhou
    await expect(repo.getValidAccessToken(notifyOrgId)).rejects.toThrow('refresh_bling_falhou');

    // Assert: status virou 'expirado'
    const [row] = await tdb2
      .select({ status: connections.status })
      .from(connections)
      .where(eq(connections.org_id, notifyOrgId))
      .limit(1);
    expect(row.status).toBe('expirado');

    // Assert: e-mail enviado ao cliente
    expect(emailSpy).toHaveBeenCalledOnce();
    expect(emailSpy).toHaveBeenCalledWith(CLIENT_EMAIL);

    emailSpy.mockRestore();
  });

  it('falha TRANSIENTE de refresh (bling_refresh_transiente) → rethrow SEM tocar o status e SEM e-mail', async () => {
    const repo = await import('@/modules/connections/connection.repository');
    const provider = await import('@/modules/providers/bling/provider');
    const emailMod = await import('@/modules/notifications/email');

    // Seed: conexão com tokens expirados (força refresh) — status volta a 'ok'
    await repo.saveBlingConnection(notifyOrgId, {
      accessToken: 'velho-t',
      refreshToken: 'refresh-velho-t',
      expiresInSeconds: 0,
    });

    // Spy: refresh falha TRANSIENTE (429/5xx/rede classificado pelo oauth.ts)
    vi.spyOn(provider.blingProvider, 'refresh').mockRejectedValueOnce(
      new Error('bling_refresh_transiente'),
    );
    const emailSpy = vi
      .spyOn(emailMod, 'sendBlingConnectionFailedEmail')
      .mockResolvedValueOnce(undefined);

    // Ação: rethrow do erro transiente ORIGINAL (não refresh_bling_falhou)
    await expect(repo.getValidAccessToken(notifyOrgId)).rejects.toThrow(
      'bling_refresh_transiente',
    );

    // Assert: status permanece 'ok' — refresh-on-use tenta de novo no próximo uso
    const [row] = await tdb2
      .select({ status: connections.status })
      .from(connections)
      .where(eq(connections.org_id, notifyOrgId))
      .limit(1);
    expect(row.status).toBe('ok');

    // Assert: ZERO e-mail em falha transitória
    expect(emailSpy).not.toHaveBeenCalled();

    emailSpy.mockRestore();
  });

  it('refresh bem-sucedido → status ok e e-mail NÃO é chamado', async () => {
    const repo = await import('@/modules/connections/connection.repository');
    const provider = await import('@/modules/providers/bling/provider');
    const emailMod = await import('@/modules/notifications/email');

    // Seed: conexão expirada para forçar o caminho de refresh
    await repo.saveBlingConnection(notifyOrgId, {
      accessToken: 'velho2',
      refreshToken: 'refresh-velho2',
      expiresInSeconds: 0,
    });

    // Spy: refresh bem-sucedido
    vi.spyOn(provider.blingProvider, 'refresh').mockResolvedValueOnce({
      accessToken: 'novo2',
      refreshToken: 'refresh-novo2',
      expiresInSeconds: 3600,
    });
    const emailSpy = vi
      .spyOn(emailMod, 'sendBlingConnectionFailedEmail')
      .mockResolvedValueOnce(undefined);

    const token = await repo.getValidAccessToken(notifyOrgId);
    expect(token).toBe('novo2');

    // Status voltou a ok
    const [row] = await tdb2
      .select({ status: connections.status })
      .from(connections)
      .where(eq(connections.org_id, notifyOrgId))
      .limit(1);
    expect(row.status).toBe('ok');

    // E-mail NÃO foi chamado no caminho de sucesso
    expect(emailSpy).not.toHaveBeenCalled();

    emailSpy.mockRestore();
  });
});
