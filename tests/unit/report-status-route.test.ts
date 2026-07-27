import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionContextMock, selectMock, selectResult } = vi.hoisted(() => {
  const selectResult: unknown[] = [];
  const selectMock = vi.fn(() => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(selectResult) }),
    }),
  }));

  return { getSessionContextMock: vi.fn(), selectMock, selectResult };
});

vi.mock('@/modules/auth/session', () => ({
  getSessionContext: (...args: unknown[]) => getSessionContextMock(...args),
}));

vi.mock('@/db/client', () => ({
  db: {
    select: selectMock,
  },
}));

import { GET } from '@/app/api/reports/[id]/status/route';

const ID = '33333333-3333-3333-3333-333333333333';
const req = new Request(`http://localhost:3000/api/reports/${ID}/status`);

describe('GET /api/reports/[id]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResult.length = 0;
  });

  it('sem sessão → 401', async () => {
    getSessionContextMock.mockResolvedValueOnce(null);
    const res = await GET(req, { params: Promise.resolve({ id: ID }) });
    expect(res.status).toBe(401);
  });

  it('uuid inválido → 404 sem consultar o banco', async () => {
    getSessionContextMock.mockResolvedValueOnce({ orgId: 'org-1' });
    const res = await GET(req, { params: Promise.resolve({ id: 'nao-uuid' }) });
    expect(res.status).toBe(404);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('report da org → 200 { status, etapa } com no-store', async () => {
    getSessionContextMock.mockResolvedValueOnce({ orgId: 'org-1' });
    selectResult.length = 0;
    selectResult.push({ status: 'running', etapa: 'analisando_ia' });
    const res = await GET(req, { params: Promise.resolve({ id: ID }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'running', etapa: 'analisando_ia' });
  });

  it('report inexistente/da outra org → 404', async () => {
    getSessionContextMock.mockResolvedValueOnce({ orgId: 'org-1' });
    selectResult.length = 0;
    const res = await GET(req, { params: Promise.resolve({ id: ID }) });
    expect(res.status).toBe(404);
  });
});
