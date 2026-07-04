import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: {
      ...mod.serverEnv,
      APP_URL: 'http://localhost:3000',
      PIPELINE_SECRET: 'segredo-de-teste-com-16+',
    },
  };
});

import { dispatchPipelineRun } from '@/modules/pipeline/dispatch';

describe('dispatchPipelineRun', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTa com x-pipeline-secret e aceita 202', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await dispatchPipelineRun('11111111-1111-1111-1111-111111111111');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/pipeline/run');
    expect((init.headers as Record<string, string>)['x-pipeline-secret']).toBe(
      'segredo-de-teste-com-16+',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      reportId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('não-202 lança pipeline_dispatch_falhou', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(dispatchPipelineRun('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      'pipeline_dispatch_falhou_500',
    );
  });
});
