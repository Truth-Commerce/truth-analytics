import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useActionState: vi.fn((_action, initial) => [initial, '/action', false]) };
});

import { OlistConnectionCard } from '@/components/connections/olist-connection-card';

const redirectUri = 'https://truth-analytics.vercel.app/api/connections/olist/callback';

describe('OlistConnectionCard', () => {
  it('orienta configuração sem expor segredo no HTML', () => {
    const html = renderToStaticMarkup(
      React.createElement(OlistConnectionCard, {
        orgId: 'org-a',
        surface: 'client_connections',
        summary: null,
        redirectUri,
      }),
    );
    expect(html).toContain('Olist ERP (antigo Tiny)');
    expect(html).toContain(redirectUri);
    expect(html).toMatch(/somente leitura/i);
    expect(html).toMatch(/relatórios continuam usando Bling/i);
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain('Salvar credenciais');
    expect(html).not.toContain('secret-value');
  });

  it('mostra autorização quando há credenciais e nunca recebe valores cifrados', () => {
    const html = renderToStaticMarkup(
      React.createElement(OlistConnectionCard, {
        orgId: 'org-a',
        surface: 'analyst_org',
        summary: {
          provider: 'olist',
          status: 'configurado',
          credentialsConfigured: true,
          authorized: false,
          operational: false,
          expiresAt: null,
          refreshExpiresAt: null,
          lastRefreshAt: null,
          lastSyncAt: null,
          lastErrorCode: null,
        },
        redirectUri,
      }),
    );
    expect(html).toContain('Autorizar no Olist');
    expect(html).toContain('/api/connections/olist?orgId=org-a&amp;surface=analyst_org');
    expect(html).toContain('Alterar credenciais');
    expect(html).toContain('Desconectar');
    expect(html).not.toContain('name="clientSecret"');
  });

  it('expõe reconexão necessária, vencimentos e CTA coerente quando expirou', () => {
    const html = renderToStaticMarkup(
      React.createElement(OlistConnectionCard, {
        orgId: 'org-a',
        surface: 'client_connections',
        summary: {
          provider: 'olist',
          status: 'expirado',
          credentialsConfigured: true,
          authorized: false,
          operational: false,
          expiresAt: new Date('2026-07-28T12:00:00.000Z'),
          refreshExpiresAt: new Date('2026-07-29T12:00:00.000Z'),
          lastRefreshAt: null,
          lastSyncAt: null,
          lastErrorCode: 'olist_refresh_invalido',
        },
        redirectUri,
      }),
    );
    expect(html).toContain('Reconexão necessária');
    expect(html).toContain('Access token');
    expect(html).toContain('Refresh token');
    expect(html).toContain('28/07/2026');
    expect(html).toContain('29/07/2026');
    expect(html).toContain('Reconectar Olist');
    expect(html).not.toContain('Autorizar no Olist');
  });
});
