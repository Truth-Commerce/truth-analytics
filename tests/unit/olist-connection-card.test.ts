import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useActionState: vi.fn((_action, initial) => [initial, '/action', false]) };
});

import { OlistConnectionCard } from '@/components/connections/olist-connection-card';

const redirectUri = 'https://truth-analytics.vercel.app/api/connections/olist/callback';

const olistSummary = {
  provider: 'olist' as const,
  status: 'configurado',
  credentialsConfigured: true,
  authorized: true,
  operational: false,
  expiresAt: null,
  refreshExpiresAt: null,
  lastRefreshAt: null,
  lastSyncAt: new Date('2026-07-30T12:00:00.000Z'),
  lastErrorCode: null,
};

const readyReadModel = {
  activeProvider: 'bling' as const,
  bling: {
    authorized: true,
    operational: true,
    lastSuccessfulSyncAt: new Date('2026-07-30T11:00:00.000Z'),
  },
  olist: olistSummary,
  preparation: {
    stage: 'ready' as const,
    ready: true,
    expectedCount: 42,
    persistedCount: 42,
    pendingDetails: 0,
    quarantinedDetails: 0,
    processedCount: 42,
    backlogCount: 0,
  },
};

describe('OlistConnectionCard', () => {
  it('orienta configuração sem expor segredo no HTML', () => {
    const html = renderToStaticMarkup(
      React.createElement(OlistConnectionCard, {
        orgId: 'org-a',
        surface: 'client_connections',
        readModel: { activeProvider: null, bling: null, olist: null, preparation: null },
        canManageErp: false,
        redirectUri,
      }),
    );
    expect(html).toContain('Olist ERP (antigo Tiny)');
    expect(html).toContain('data-testid="olist-connection-status"');
    expect(html).toContain(redirectUri);
    expect(html).toMatch(/somente leitura/i);
    expect(html).toMatch(/pedidos e relatórios usarão os dados do Olist/i);
    expect(html).not.toMatch(/relatórios continuam usando Bling/i);
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
        readModel: {
          activeProvider: null,
          bling: null,
          preparation: null,
          olist: {
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
        },
        canManageErp: true,
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
        readModel: {
          activeProvider: null,
          bling: null,
          preparation: null,
          olist: {
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
        },
        canManageErp: false,
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

  it('mostra ao cliente o ERP ativo e o progresso sem renderizar controles de troca', () => {
    const html = renderToStaticMarkup(
      React.createElement(OlistConnectionCard, {
        orgId: 'org-a',
        surface: 'client_connections',
        readModel: readyReadModel,
        canManageErp: false,
        redirectUri,
      }),
    );

    expect(html).toContain('ERP ativo');
    expect(html).toContain('Bling');
    expect(html).toContain('42 de 42 pedidos preparados');
    expect(html).toContain('Pronto para ativação');
    expect(html).not.toContain('Ativar Olist');
    expect(html).not.toContain('Voltar para Bling');
  });

  it('oferece ativação somente ao staff quando o Olist está pronto e ainda não está ativo', () => {
    const html = renderToStaticMarkup(
      React.createElement(OlistConnectionCard, {
        orgId: 'org-a',
        surface: 'analyst_org',
        readModel: readyReadModel,
        canManageErp: true,
        redirectUri,
      }),
    );

    expect(html).toContain('Ativar Olist');
    expect(html).not.toContain('Voltar para Bling');
  });

  it('oferece rollback somente ao staff quando Olist está ativo e Bling segue autorizado', () => {
    const html = renderToStaticMarkup(
      React.createElement(OlistConnectionCard, {
        orgId: 'org-a',
        surface: 'analyst_org',
        readModel: {
          ...readyReadModel,
          activeProvider: 'olist',
          bling: { ...readyReadModel.bling, operational: false },
          olist: { ...olistSummary, status: 'ok', operational: true },
        },
        canManageErp: true,
        redirectUri,
      }),
    );

    expect(html).toContain('Voltar para Bling');
    expect(html).not.toContain('Ativar Olist');
  });

  it('não oferece ativação enquanto a preparação não estiver pronta', () => {
    const html = renderToStaticMarkup(
      React.createElement(OlistConnectionCard, {
        orgId: 'org-a',
        surface: 'analyst_org',
        readModel: {
          ...readyReadModel,
          preparation: {
            ...readyReadModel.preparation,
            stage: 'details',
            ready: false,
            persistedCount: 35,
            pendingDetails: 7,
          },
        },
        canManageErp: true,
        redirectUri,
      }),
    );

    expect(html).toContain('35 de 42 pedidos preparados');
    expect(html).toContain('7 detalhes pendentes');
    expect(html).not.toContain('Ativar Olist');
    expect(html).not.toContain('Voltar para Bling');
  });
});
