import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, PIPELINE_SECRET: 'segredo-de-teste-com-16+' },
  };
});
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => void p }));
vi.mock('@/modules/pipeline/orchestrator', () => ({
  generateReport: vi.fn().mockResolvedValue({ reportId: 'x', status: 'done' }),
}));

import { generateReport } from '@/modules/pipeline/orchestrator';
import { POST } from '@/app/api/pipeline/run/route';

function req(body: unknown, secret?: string): Request {
  return new Request('http://localhost:3000/api/pipeline/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-pipeline-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

const REPORT_ID = '22222222-2222-2222-2222-222222222222';

describe('POST /api/pipeline/run', () => {
  it('sem secret → 401 e não roda o pipeline', async () => {
    const res = await POST(req({ reportId: REPORT_ID }));
    expect(res.status).toBe(401);
    expect(generateReport).not.toHaveBeenCalled();
  });

  it('secret errado → 401', async () => {
    const res = await POST(req({ reportId: REPORT_ID }, 'errado-mas-16-chars!!'));
    expect(res.status).toBe(401);
  });

  it('body inválido → 400', async () => {
    const res = await POST(req({ reportId: 'nao-uuid' }, 'segredo-de-teste-com-16+'));
    expect(res.status).toBe(400);
  });

  it('ok → 202 e dispara generateReport via waitUntil', async () => {
    const res = await POST(req({ reportId: REPORT_ID }, 'segredo-de-teste-com-16+'));
    expect(res.status).toBe(202);
    expect(generateReport).toHaveBeenCalledWith(REPORT_ID);
  });
});
