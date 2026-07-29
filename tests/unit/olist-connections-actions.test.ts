import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/auth/require-session', () => ({ requireSession: vi.fn() }));
vi.mock('@/modules/connections/connection-access', () => ({ assertConnectionOrgAccess: vi.fn() }));
vi.mock('@/modules/connections/provider-connection.repository', () => ({
  configureProviderCredentials: vi.fn(),
  disconnectProvider: vi.fn(),
}));

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/modules/auth/require-session';
import { assertConnectionOrgAccess } from '@/modules/connections/connection-access';
import {
  configureProviderCredentials,
  disconnectProvider,
} from '@/modules/connections/provider-connection.repository';
import {
  disconnectOlistAction,
  saveOlistCredentialsAction,
} from '@/actions/olist-connections.actions';

const ORG_ID = '00000000-0000-4000-8000-000000000001';

function form(entries: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(entries)) result.set(key, value);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({
    id: 'user-a',
    orgId: ORG_ID,
    role: 'client',
    orgStatus: 'active',
    plano: null,
  });
});

describe('Olist connection actions', () => {
  it.each([
    ['', 'secret'],
    ['client', ''],
    ['x'.repeat(256), 'secret'],
    ['client', 'x'.repeat(1025)],
  ])('rejeita credenciais vazias ou grandes', async (clientId, clientSecret) => {
    const result = await saveOlistCredentialsAction(
      {},
      form({ orgId: ORG_ID, surface: 'client_connections', clientId, clientSecret }),
    );
    expect(result.error).toBeTruthy();
    expect(configureProviderCredentials).not.toHaveBeenCalled();
  });

  it('executa o guard antes da mutação e fixa provider Olist', async () => {
    vi.mocked(assertConnectionOrgAccess).mockRejectedValueOnce(new Error('acesso_negado'));
    const result = await saveOlistCredentialsAction(
      {},
      form({
        orgId: ORG_ID,
        surface: 'client_connections',
        clientId: 'client',
        clientSecret: 'secret',
        provider: 'bling',
      }),
    );
    expect(result).toEqual({ error: 'Você não tem acesso a esta organização.' });
    expect(configureProviderCredentials).not.toHaveBeenCalled();
  });

  it('salva sem devolver credenciais e revalida somente a superfície derivada', async () => {
    const result = await saveOlistCredentialsAction(
      {},
      form({
        orgId: ORG_ID,
        surface: 'client_connections',
        clientId: 'client',
        clientSecret: 'secret',
      }),
    );
    expect(configureProviderCredentials).toHaveBeenCalledWith({
      orgId: ORG_ID,
      provider: 'olist',
      clientId: 'client',
      clientSecret: 'secret',
      actorUserId: 'user-a',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/conexoes');
    expect(JSON.stringify(result)).not.toMatch(/client|secret/);
    expect(result).toEqual({ ok: true });
  });

  it('desconecta após guard e deriva o caminho do analista', async () => {
    const result = await disconnectOlistAction(
      {},
      form({ orgId: ORG_ID, surface: 'analyst_org' }),
    );
    expect(disconnectProvider).toHaveBeenCalledWith({
      orgId: ORG_ID,
      provider: 'olist',
      actorUserId: 'user-a',
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/analista/${ORG_ID}`);
    expect(result).toEqual({ ok: true });
  });
});
