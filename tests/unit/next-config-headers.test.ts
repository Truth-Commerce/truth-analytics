import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config.mjs';

describe('headers de segurança', () => {
  it('poweredByHeader desligado', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('headers globais incluem CSP, HSTS, nosniff, referrer e permissions', async () => {
    expect(nextConfig.headers).toBeDefined();
    const grupos = await nextConfig.headers!();
    const global = grupos.find((g) => g.source === '/:path*');
    expect(global).toBeDefined();
    const mapa = Object.fromEntries(
      global!.headers.map((h) => [h.key, h.value]),
    );
    expect(mapa['Content-Security-Policy']).toContain("default-src 'self'");
    expect(mapa['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(mapa['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(mapa['X-Content-Type-Options']).toBe('nosniff');
    expect(mapa['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(mapa['Permissions-Policy']).toContain('camera=()');
  });
});
