import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (só usados pelos testes da VARREDURA GLOBAL — linhaResumo é pura).
// A varredura global (todas as orgs active) é coberta AQUI com mock de db:
// o teste de integração usa escopo injetado por org para não varrer orgs de
// outras suítes no banco compartilhado (lição da Task 7).
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  dbQueue: [] as unknown[],
  sendDigestSemanalEmail: vi.fn(),
  getOrgPrimaryUser: vi.fn(),
  getTotalVendasMesCorrente: vi.fn(),
  getTotalVendasMesAnterior: vi.fn(),
  getActiveErpConnection: vi.fn(),
}));

// Fake db: toda query termina em .where() → devolve o próximo item da fila.
// Ordem determinística: 1 select de orgs; depois, por org, os 4 counts do
// montarDigestOrg (total, concluídas 7d, atrasadas, em andamento).
vi.mock('@/db/client', () => ({
  db: {
    select: () => {
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => Promise.resolve(mocks.dbQueue.shift() ?? []),
      };
      return chain;
    },
  },
}));

vi.mock('@/modules/notifications/email', () => ({
  sendDigestSemanalEmail: (...args: unknown[]) => mocks.sendDigestSemanalEmail(...args),
}));

vi.mock('@/modules/notifications/recipients', () => ({
  getOrgPrimaryUser: (...args: unknown[]) => mocks.getOrgPrimaryUser(...args),
}));

vi.mock('@/modules/organizations/organization-settings.repository', () => ({
  getTotalVendasMesCorrente: (...args: unknown[]) => mocks.getTotalVendasMesCorrente(...args),
  getTotalVendasMesAnterior: (...args: unknown[]) => mocks.getTotalVendasMesAnterior(...args),
}));

vi.mock('@/modules/connections/active-provider.repository', () => ({
  getActiveErpConnection: (...args: unknown[]) => mocks.getActiveErpConnection(...args),
}));

import { linhaResumo, processarDigestSemanal } from '@/modules/tasks/digest-semanal';

describe('linhaResumo', () => {
  it('monta a frase pt-BR com emojis', () => {
    expect(linhaResumo({ concluidas7d: 3, atrasadas: 2, emAndamento: 4 })).toBe(
      '3 concluídas ✅, 2 atrasadas ⚠️, 4 em andamento',
    );
    expect(linhaResumo({ concluidas7d: 1, atrasadas: 0, emAndamento: 0 })).toBe(
      '1 concluída ✅, 0 atrasadas ⚠️, 0 em andamento',
    );
  });
});

describe('processarDigestSemanal — varredura global (db mockado)', () => {
  const AGORA = new Date('2026-07-13T12:00:00Z');
  const contagens = (total: number, concluidas: number, atrasadas: number, andamento: number) => [
    [{ n: total }],
    [{ n: concluidas }],
    [{ n: atrasadas }],
    [{ n: andamento }],
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbQueue.length = 0;
    mocks.getTotalVendasMesCorrente.mockResolvedValue(1000.5);
    mocks.getTotalVendasMesAnterior.mockResolvedValue(800);
    mocks.getActiveErpConnection.mockImplementation((orgId: string) => Promise.resolve({ orgId, provider: 'bling', sourceGeneration: 1 }));
  });

  it('envia 1 e-mail por org COM tasks e pula org sem nenhuma task', async () => {
    mocks.dbQueue.push(
      [
        { id: 'org-a', name: 'Loja A' },
        { id: 'org-b', name: 'Loja B' },
      ],
      ...contagens(3, 1, 2, 4), // org-a: tem tasks
      ...contagens(0, 0, 0, 0), // org-b: nenhuma task → sem e-mail
    );
    mocks.getOrgPrimaryUser.mockResolvedValue({ id: 'u1', email: 'a@x.com' });

    const res = await processarDigestSemanal(AGORA);

    expect(res).toEqual({ orgs: 2, enviados: 1 });
    expect(mocks.sendDigestSemanalEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendDigestSemanalEmail).toHaveBeenCalledWith('a@x.com', {
      orgName: 'Loja A',
      resumo: '1 concluída ✅, 2 atrasadas ⚠️, 4 em andamento',
      vendasMes: 1000.5,
      vendasMesAnterior: 800,
    });
  });

  it('best-effort: falha em uma org não aborta as demais', async () => {
    mocks.dbQueue.push(
      [
        { id: 'org-a', name: 'Loja A' },
        { id: 'org-b', name: 'Loja B' },
      ],
      ...contagens(1, 0, 0, 1), // org-a
      ...contagens(2, 1, 1, 0), // org-b
    );
    mocks.getOrgPrimaryUser
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'u2', email: 'b@x.com' });

    const res = await processarDigestSemanal(AGORA);

    expect(res).toEqual({ orgs: 2, enviados: 1 });
    expect(mocks.sendDigestSemanalEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendDigestSemanalEmail.mock.calls[0][0]).toBe('b@x.com');
  });

  it('org sem usuário client → pula sem enviar (e sem lançar)', async () => {
    mocks.dbQueue.push([{ id: 'org-a', name: 'Loja A' }], ...contagens(1, 0, 1, 0));
    mocks.getOrgPrimaryUser.mockResolvedValue(null);

    const res = await processarDigestSemanal(AGORA);

    expect(res).toEqual({ orgs: 1, enviados: 0 });
    expect(mocks.sendDigestSemanalEmail).not.toHaveBeenCalled();
  });

  it('mantém digest de tasks sem fonte ERP e zera vendas', async () => {
    mocks.dbQueue.push([{ id: 'org-a', name: 'Loja A' }], ...contagens(2, 1, 0, 1));
    mocks.getActiveErpConnection.mockResolvedValue(null);
    mocks.getOrgPrimaryUser.mockResolvedValue({ id: 'u1', email: 'a@x.com' });

    await expect(processarDigestSemanal(AGORA)).resolves.toEqual({ orgs: 1, enviados: 1 });
    expect(mocks.sendDigestSemanalEmail).toHaveBeenCalledWith('a@x.com', expect.objectContaining({
      vendasMes: 0,
      vendasMesAnterior: 0,
    }));
    expect(mocks.getTotalVendasMesCorrente).not.toHaveBeenCalled();
    expect(mocks.getTotalVendasMesAnterior).not.toHaveBeenCalled();
  });
});
