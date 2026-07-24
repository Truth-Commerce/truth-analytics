import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, CRON_SECRET: 'cron-estoque-teste-16+++' },
  };
});

import { GET } from '@/app/api/cron/sincronizar-estoque/route';

const databaseUrl = process.env.DATABASE_URL_TEST;

function req(auth?: string): Request {
  return new Request('http://localhost:3000/api/cron/sincronizar-estoque', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe('cron sincronizar-estoque — guards', () => {
  it('sem Authorization → 401', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('secret errado → 401', async () => {
    const res = await GET(req('Bearer errado'));
    expect(res.status).toBe(401);
  });

  it.skipIf(!databaseUrl)('secret correto → 200 com contadores', async () => {
    const res = await GET(req('Bearer cron-estoque-teste-16+++'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orgs: number; sincronizadas: number; falhas: number };
    expect(typeof body.orgs).toBe('number');
    expect(typeof body.sincronizadas).toBe('number');
    expect(typeof body.falhas).toBe('number');
  });
});
