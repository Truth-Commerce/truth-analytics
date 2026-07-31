import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/auth/require-session', () => ({ requireSession: vi.fn() }));
vi.mock('@/modules/auth/require-active-org', () => ({ assertNaoImpersonando: vi.fn() }));
vi.mock('@/modules/analista/analista.repository', () => ({ assertOrgAccess: vi.fn() }));
vi.mock('@/modules/connections/erp-activation.repository', () => ({
  activateErp: vi.fn(),
  rollbackErp: vi.fn(),
}));

import { revalidatePath } from 'next/cache';
import { activateOlistAction, rollbackToBlingAction } from '@/actions/erp-activation.actions';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { assertNaoImpersonando } from '@/modules/auth/require-active-org';
import { requireSession } from '@/modules/auth/require-session';
import { activateErp, rollbackErp } from '@/modules/connections/erp-activation.repository';

const ORG_ID = '00000000-0000-4000-8000-000000000001';

function form(entries: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(entries)) result.set(key, value);
  return result;
}

function access(role: 'admin_truth' | 'analista' | 'client' = 'analista') {
  return {
    id: `${role}-1`,
    orgId: 'org-interna',
    role,
    orgStatus: 'active' as const,
    plano: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue(access());
  vi.mocked(activateErp).mockResolvedValue({
    previous: 'bling',
    active: 'olist',
    mode: 'explicit',
    expected: 10,
    persisted: 10,
    pendingDetails: 0,
    quarantinedDetails: 0,
    reasons: [],
  });
  vi.mocked(rollbackErp).mockResolvedValue({
    previous: 'olist',
    active: 'bling',
    mode: 'explicit',
    expected: null,
    persisted: null,
    pendingDetails: null,
    quarantinedDetails: null,
    reasons: [],
  });
});

describe('activateOlistAction', () => {
  it('fixa Olist explícito no servidor e ignora target, mode e segredos forjados', async () => {
    const result = await activateOlistAction({}, form({
      orgId: ORG_ID,
      target: 'bling',
      mode: 'automatic',
      access_token: 'nao-pode-vazar',
    }));

    expect(activateErp).toHaveBeenCalledWith({
      orgId: ORG_ID,
      target: 'olist',
      actorUserId: 'analista-1',
      mode: 'explicit',
    });
    expect(JSON.stringify(result)).not.toContain('nao-pode-vazar');
    expect(result).toEqual({ ok: true });
  });

  it('permite admin Truth e revalida as superfícies derivadas da organização', async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(access('admin_truth'));

    await activateOlistAction({}, form({ orgId: ORG_ID }));

    expect(assertOrgAccess).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin_truth' }), ORG_ID);
    expect(revalidatePath).toHaveBeenCalledTimes(3);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, `/analista/${ORG_ID}`);
    expect(revalidatePath).toHaveBeenNthCalledWith(2, '/conexoes');
    expect(revalidatePath).toHaveBeenNthCalledWith(3, '/dashboard');
  });

  it('barra cliente antes do acesso à organização e do repositório', async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(access('client'));

    const result = await activateOlistAction({}, form({ orgId: ORG_ID }));

    expect(result).toEqual({ error: 'Você não tem permissão para trocar o ERP ativo.' });
    expect(assertOrgAccess).not.toHaveBeenCalled();
    expect(activateErp).not.toHaveBeenCalled();
  });

  it('barra impersonação e analista fora da carteira antes do repositório', async () => {
    vi.mocked(assertNaoImpersonando).mockRejectedValueOnce(
      new Error('Modo visualização: ações desabilitadas'),
    );
    const impersonation = await activateOlistAction({}, form({ orgId: ORG_ID }));

    vi.mocked(assertOrgAccess).mockRejectedValueOnce(new Error('acesso_negado'));
    const unassigned = await activateOlistAction({}, form({ orgId: ORG_ID }));

    expect(impersonation).toEqual({ error: 'Ações indisponíveis no modo de visualização.' });
    expect(unassigned).toEqual({ error: 'Você não tem acesso a esta organização.' });
    expect(activateErp).not.toHaveBeenCalled();
  });

  it('publica erros de domínio estáveis sem expor detalhes internos', async () => {
    vi.mocked(activateErp).mockRejectedValueOnce(new Error('erp_ativo_alterado'));
    const conflict = await activateOlistAction({}, form({ orgId: ORG_ID }));

    vi.mocked(activateErp).mockRejectedValueOnce(new Error('access_token=segredo-do-provedor'));
    const unexpected = await activateOlistAction({}, form({ orgId: ORG_ID }));

    expect(conflict).toEqual({ error: 'O ERP ativo mudou. Atualize a página e tente novamente.' });
    expect(unexpected).toEqual({ error: 'Não foi possível ativar o Olist.' });
    expect(JSON.stringify(unexpected)).not.toContain('segredo-do-provedor');
  });
});

describe('rollbackToBlingAction', () => {
  it('fixa rollback para Bling no servidor e não depende do kill switch Olist', async () => {
    const result = await rollbackToBlingAction({}, form({
      orgId: ORG_ID,
      target: 'olist',
      mode: 'automatic',
    }));

    expect(rollbackErp).toHaveBeenCalledWith({
      orgId: ORG_ID,
      target: 'bling',
      actorUserId: 'analista-1',
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejeita organização inválida sem autenticar nem executar mutação', async () => {
    const result = await rollbackToBlingAction({}, form({ orgId: 'org-invalida' }));

    expect(result).toEqual({ error: 'Solicitação inválida.' });
    expect(requireSession).not.toHaveBeenCalled();
    expect(rollbackErp).not.toHaveBeenCalled();
  });
});
