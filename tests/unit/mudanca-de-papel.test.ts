import { describe, expect, it } from 'vitest';

import { avaliarTrocaDePapel, type ContextoTroca } from '@/modules/admin/mudanca-de-papel';

const BASE: ContextoTroca = {
  atorUserId: 'admin-1',
  alvo: { id: 'user-1', role: 'client', orgId: 'org-cliente' },
  novoPapel: 'analista',
  orgInternaId: 'org-interna',
  carteiraDoAlvo: 0,
  totalAdmins: 1,
};

function ctx(over: Partial<ContextoTroca>): ContextoTroca {
  return { ...BASE, ...over, alvo: { ...BASE.alvo, ...over.alvo } };
}

describe('avaliarTrocaDePapel', () => {
  it('promove client de org cliente a analista e move para a org interna', () => {
    expect(avaliarTrocaDePapel(BASE)).toEqual({ ok: true, moverParaOrgInterna: true });
  });

  it('não move quem já está na org interna', () => {
    const r = avaliarTrocaDePapel(
      ctx({ alvo: { id: 'a', role: 'analista', orgId: 'org-interna' }, novoPapel: 'admin_truth' }),
    );
    expect(r).toEqual({ ok: true, moverParaOrgInterna: false });
  });

  it('bloqueia o admin de alterar o próprio papel', () => {
    const r = avaliarTrocaDePapel(
      ctx({ alvo: { id: 'admin-1', role: 'admin_truth', orgId: 'org-interna' }, novoPapel: 'analista', totalAdmins: 2 }),
    );
    expect(r).toEqual({ ok: false, motivo: 'proprio_usuario' });
  });

  it('rejeita troca para o mesmo papel', () => {
    const r = avaliarTrocaDePapel(ctx({ alvo: { id: 'a', role: 'analista', orgId: 'org-interna' }, novoPapel: 'analista' }));
    expect(r).toEqual({ ok: false, motivo: 'papel_igual' });
  });

  it('nunca rebaixa o último admin_truth', () => {
    const r = avaliarTrocaDePapel(
      ctx({ alvo: { id: 'outro-admin', role: 'admin_truth', orgId: 'org-interna' }, novoPapel: 'analista', totalAdmins: 1 }),
    );
    expect(r).toEqual({ ok: false, motivo: 'ultimo_admin' });
  });

  it('permite rebaixar admin quando existe outro admin', () => {
    const r = avaliarTrocaDePapel(
      ctx({ alvo: { id: 'outro-admin', role: 'admin_truth', orgId: 'org-interna' }, novoPapel: 'analista', totalAdmins: 2 }),
    );
    expect(r).toEqual({ ok: true, moverParaOrgInterna: false });
  });

  it('bloqueia tirar o papel de analista que ainda tem carteira', () => {
    const r = avaliarTrocaDePapel(
      ctx({
        alvo: { id: 'analista-1', role: 'analista', orgId: 'org-interna' },
        novoPapel: 'admin_truth',
        carteiraDoAlvo: 3,
      }),
    );
    expect(r).toEqual({ ok: false, motivo: 'carteira_pendente' });
  });

  it('bloqueia virar cliente sem empresa de destino (usuário na org interna)', () => {
    const r = avaliarTrocaDePapel(
      ctx({ alvo: { id: 'analista-1', role: 'analista', orgId: 'org-interna' }, novoPapel: 'client' }),
    );
    expect(r).toEqual({ ok: false, motivo: 'sem_empresa_destino' });
  });

  it('permite virar cliente quando o usuário já está numa empresa cliente', () => {
    const r = avaliarTrocaDePapel(
      ctx({ alvo: { id: 'analista-1', role: 'analista', orgId: 'org-cliente' }, novoPapel: 'client' }),
    );
    expect(r).toEqual({ ok: true, moverParaOrgInterna: false });
  });

  it('a trava de carteira vem antes da de empresa de destino', () => {
    const r = avaliarTrocaDePapel(
      ctx({
        alvo: { id: 'analista-1', role: 'analista', orgId: 'org-interna' },
        novoPapel: 'client',
        carteiraDoAlvo: 2,
      }),
    );
    expect(r).toEqual({ ok: false, motivo: 'carteira_pendente' });
  });

  it('rejeita papel desconhecido vindo do formulário', () => {
    const r = avaliarTrocaDePapel(ctx({ novoPapel: 'root' as never }));
    expect(r).toEqual({ ok: false, motivo: 'papel_invalido' });
  });
});
