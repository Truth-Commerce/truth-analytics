import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  serverEnv: { SENTRY_DSN: undefined as string | undefined },
}));

vi.mock('@/lib/env', () => ({ serverEnv: state.serverEnv }));

import { captureException } from '@/lib/sentry';

describe('captureException (Sentry opcional via fetch)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    state.serverEnv.SENTRY_DSN = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('DSN válido → chama fetch na store API com a key do DSN', async () => {
    state.serverEnv.SENTRY_DSN = 'https://chave123@o111.ingest.sentry.io/222';
    await captureException(new Error('boom'), { orgId: 'org-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://o111.ingest.sentry.io/api/222/store/');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Sentry-Auth']).toContain('sentry_key=chave123');
    const body = JSON.parse(init.body as string);
    expect(body.message).toBe('boom');
    expect(body.exception.values[0].type).toBe('Error');
    expect(body.extra.orgId).toBe('org-1');
  });

  it('SENTRY_DSN ausente → no-op (fetch não é chamado)', async () => {
    await captureException(new Error('boom'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('DSN inválido/não parseável → no-op sem lançar', async () => {
    state.serverEnv.SENTRY_DSN = 'https://host.sem.key/123';
    await expect(captureException(new Error('boom'))).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetch que rejeita → não propaga', async () => {
    state.serverEnv.SENTRY_DSN = 'https://chave123@o111.ingest.sentry.io/222';
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(captureException(new Error('boom'))).resolves.toBeUndefined();
  });

  it('err não-Error com toString que lança → não propaga (nunca lança)', async () => {
    state.serverEnv.SENTRY_DSN = 'https://chave123@o111.ingest.sentry.io/222';
    const evil = {
      toString() {
        throw new Error('toString explode');
      },
    };
    await expect(captureException(evil)).resolves.toBeUndefined();
  });
});
