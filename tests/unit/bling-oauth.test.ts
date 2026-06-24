import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: {
    BLING_CLIENT_ID: 'cli-123',
    BLING_CLIENT_SECRET: 'sec-123',
    BLING_REDIRECT_URI: 'http://localhost:3000/api/connections/bling/callback',
    BLING_API_BASE: 'https://www.bling.com.br/Api/v3',
  },
}));

describe('buildAuthorizeUrl', () => {
  it('monta a URL de autorização com os params certos quando configurado', async () => {
    const { buildAuthorizeUrl } = await import('@/modules/providers/bling/oauth');
    const url = new URL(buildAuthorizeUrl('xyz-state'));
    expect(url.pathname.endsWith('/oauth/authorize')).toBe(true);
    expect(url.searchParams.get('client_id')).toBe('cli-123');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('xyz-state');
    expect(url.searchParams.get('redirect_uri')).toContain('/api/connections/bling/callback');
  });
});
