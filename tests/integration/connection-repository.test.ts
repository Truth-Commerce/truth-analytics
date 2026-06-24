import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connections, organizations } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('connection.repository — integração', () => {
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
