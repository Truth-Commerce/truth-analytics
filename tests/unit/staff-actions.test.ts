import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/auth/require-analista', () => ({
  requireAnalista: vi.fn().mockResolvedValue({
    id: 'staff1', orgId: 'org-interna', role: 'analista', orgStatus: 'active', plano: null,
  }),
}));
vi.mock('@/modules/analista/analista.repository', () => ({ assertOrgAccess: vi.fn() }));
vi.mock('@/modules/admin/admin.repository', () => ({ getOrganizationById: vi.fn() }));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit: vi.fn() }));
vi.mock('@/modules/tracked-products/tracked-product.repository', () => ({
  addTrackedProduct: vi.fn(),
  removeTrackedProduct: vi.fn(),
}));

import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import {
  addTrackedProduct,
  removeTrackedProduct,
} from '@/modules/tracked-products/tracked-product.repository';
import {
  staffAddTrackedProductAction,
  staffRemoveTrackedProductAction,
} from '@/actions/staff.actions';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const ORG = {
  id: 'org-cliente', name: 'Loja', status: 'active' as const, plano: 'weekly' as const,
  nicho: null, created_at: new Date(), proximo_relatorio_liberado_em: null,
};

// clearAllMocks zera só o histórico de chamadas — a implementação de
// requireAnalista (mockResolvedValue no factory) permanece entre os testes.
beforeEach(() => {
  vi.clearAllMocks();
});

describe('staffAddTrackedProductAction', () => {
  it('analista fora da carteira → Acesso negado (assertOrgAccess barra ANTES do repositório)', async () => {
    vi.mocked(assertOrgAccess).mockRejectedValueOnce(new Error('acesso_negado'));
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'Produto X', sku: '', keywords: 'a, b',
    }));
    expect(res.error).toBe('Acesso negado.');
    expect(addTrackedProduct).not.toHaveBeenCalled();
  });

  it('usa o plano REAL da org (não o da sessão do staff) e audita', async () => {
    vi.mocked(getOrganizationById).mockResolvedValueOnce(ORG);
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'Produto X', sku: 'PX-1', keywords: 'a, b',
    }));
    expect(res).toEqual({ ok: true });
    expect(addTrackedProduct).toHaveBeenCalledWith({
      orgId: 'org-cliente', nome: 'Produto X', sku: 'PX-1', keywords: ['a', 'b'], plano: 'weekly',
    });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-cliente', userId: 'staff1', acao: 'tracked_product.criado_staff',
    }));
  });

  it('limite do plano do cliente → mensagem clara', async () => {
    vi.mocked(getOrganizationById).mockResolvedValueOnce(ORG);
    vi.mocked(addTrackedProduct).mockRejectedValueOnce(new Error('limite_tracked_products'));
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'Produto X', sku: '', keywords: '',
    }));
    expect(res.error).toBe('Limite de produtos do plano deste cliente atingido.');
  });

  it('nome curto → erro de validação sem tocar o repositório', async () => {
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'X', sku: '', keywords: '',
    }));
    expect(res.error).toBe('Informe o nome do produto.');
    expect(addTrackedProduct).not.toHaveBeenCalled();
  });
});

describe('staffRemoveTrackedProductAction', () => {
  it('remove escopado pela org e audita', async () => {
    const res = await staffRemoveTrackedProductAction({}, form({
      orgId: 'org-cliente', id: 'prod-1',
    }));
    expect(res).toEqual({ ok: true });
    expect(removeTrackedProduct).toHaveBeenCalledWith({ orgId: 'org-cliente', id: 'prod-1' });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-cliente', userId: 'staff1', acao: 'tracked_product.removido_staff',
      detalhes: { id: 'prod-1' },
    }));
  });
});
