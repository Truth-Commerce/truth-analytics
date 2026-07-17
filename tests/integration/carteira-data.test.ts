import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { connections, organizations, orders, tasks, users } from '@/db/schema';
import { hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';
import { hashPassword } from '@/modules/auth/password';
import type { UserAccess } from '@/modules/auth/user.types';
import { somarDias } from '@/modules/tasks/sla';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
// NOTA: 'ta-test-carteira-' já é usado por analista-carteira.test.ts (LIKE
// wildcard no afterAll de lá) — reusar o mesmo prefixo faz o cleanup de UM
// suite apagar orgs do OUTRO quando os dois rodam juntos (FK violation em
// connections). Prefixo dedicado para este arquivo.
const PREFIX = 'ta-test-carteiradados-';

const asAccess = (id: string, role: UserAccess['role']): UserAccess =>
  ({ id, orgId: 'x', role, orgStatus: 'active', plano: null }) as UserAccess;

describe.skipIf(!url)('carteira-data.repository — integração', () => {
  const agora = new Date();
  let orgRiscoId = '';
  let orgSaudavelId = '';
  let orgForaId = '';
  let analistaId = '';
  const userIds: string[] = [];
  const taskIds: string[] = [];

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');

    const [orgRisco] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}risco-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgRiscoId = orgRisco!.id;

    const [orgSaudavel] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}saudavel-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgSaudavelId = orgSaudavel!.id;

    const [orgFora] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}fora-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgForaId = orgFora!.id;

    const [an] = await db
      .insert(users)
      .values({ org_id: orgRiscoId, email: `${PREFIX}an-${RUN}@example.com`, senha_hash, role: 'analista' })
      .returning({ id: users.id });
    analistaId = an!.id;
    userIds.push(analistaId);

    // Carteira do analista = orgRisco + orgSaudavel; orgFora fica sem analista.
    await db
      .update(organizations)
      .set({ analista_id: analistaId })
      .where(inArray(organizations.id, [orgRiscoId, orgSaudavelId]));

    // orgRisco: conexão Bling expirada + 1 task atrasada + 1 em_revisao.
    await db.insert(connections).values({
      org_id: orgRiscoId,
      provider: 'bling',
      status: 'expirado',
      access_token: null,
      refresh_token: null,
    });

    const hoje = hojeBrt(agora);
    const [tAtrasada] = await db
      .insert(tasks)
      .values({
        org_id: orgRiscoId,
        titulo: `${PREFIX}atrasada`,
        tipo: 'outro',
        prioridade: 'media',
        status: 'todo',
        prazo: somarDias(hoje, -1),
        criado_por: 'analista',
      })
      .returning({ id: tasks.id });
    const [tRevisao] = await db
      .insert(tasks)
      .values({
        org_id: orgRiscoId,
        titulo: `${PREFIX}revisao`,
        tipo: 'outro',
        prioridade: 'media',
        status: 'em_revisao',
        criado_por: 'cliente',
      })
      .returning({ id: tasks.id });
    taskIds.push(tAtrasada!.id, tRevisao!.id);

    // orgRisco: faturamento — 500 no mês corrente, 1000 no mês anterior.
    const inicioMesAtual = inicioDeDiaUtc(`${hoje.slice(0, 7)}-01`);
    const mesAnterior = new Date(inicioMesAtual.getTime() - 15 * 86_400_000);
    await db.insert(orders).values([
      {
        org_id: orgRiscoId,
        bling_order_id: `${PREFIX}risco-atual-${RUN}`,
        canal: 'teste',
        data: agora,
        valor_total: '500.00',
      },
      {
        org_id: orgRiscoId,
        bling_order_id: `${PREFIX}risco-anterior-${RUN}`,
        canal: 'teste',
        data: mesAnterior,
        valor_total: '1000.00',
      },
    ]);

    // orgSaudavel: conexão ok, token expira em 30 dias (>>72h) — sem tasks, sem histórico
    // de vendas anteriores (média das 4 semanas fica 0 → não dispara "queda").
    await db.insert(connections).values({
      org_id: orgSaudavelId,
      provider: 'bling',
      status: 'ok',
      access_token: 'enc-token-fake',
      refresh_token: 'enc-refresh-fake',
      expira_em: new Date(agora.getTime() + 30 * 86_400_000),
    });
    await db.insert(orders).values({
      org_id: orgSaudavelId,
      bling_order_id: `${PREFIX}saudavel-atual-${RUN}`,
      canal: 'teste',
      data: agora,
      valor_total: '300.00',
    });
  });

  afterAll(async () => {
    const orgIds = [orgRiscoId, orgSaudavelId, orgForaId].filter(Boolean);
    if (taskIds.length) await db.delete(tasks).where(inArray(tasks.id, taskIds));
    if (orgIds.length) {
      await db.delete(orders).where(inArray(orders.org_id, orgIds));
      await db.delete(connections).where(inArray(connections.org_id, orgIds));
    }
    // organizations.analista_id → users.id (sem ON DELETE): limpar antes do delete de users.
    await db.update(organizations).set({ analista_id: null }).where(like(organizations.name, `${PREFIX}%`));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('escopo: analista vê só as 2 orgs da carteira; admin vê as 3', async () => {
    const { carteiraResumo } = await import('@/modules/analista/carteira-data.repository');

    const resumoAnalista = await carteiraResumo(asAccess(analistaId, 'analista'), agora);
    const idsAnalista = resumoAnalista.map((r) => r.orgId);
    expect(idsAnalista).toEqual(expect.arrayContaining([orgRiscoId, orgSaudavelId]));
    expect(idsAnalista).not.toContain(orgForaId);
    expect(resumoAnalista).toHaveLength(2);

    const resumoAdmin = await carteiraResumo(asAccess('qualquer-admin', 'admin_truth'), agora);
    const idsAdmin = resumoAdmin.map((r) => r.orgId);
    expect(idsAdmin).toEqual(expect.arrayContaining([orgRiscoId, orgSaudavelId, orgForaId]));
  });

  it('org com conexão expirada + task atrasada → risco reflete (nível != ok, motivos corretos)', async () => {
    const { carteiraResumo } = await import('@/modules/analista/carteira-data.repository');
    const resumo = await carteiraResumo(asAccess(analistaId, 'analista'), agora);
    const risco = resumo.find((r) => r.orgId === orgRiscoId)!;

    expect(risco).toBeDefined();
    expect(risco.risco.nivel).not.toBe('ok');
    expect(risco.risco.motivos).toContain('Conexão Bling expirada');
    expect(risco.risco.motivos).toContain('1 tarefa atrasada');
    expect(risco.tasksAtrasadas).toBe(1);
    expect(risco.pendentesRevisao).toBe(1);
    expect(risco.tasksAbertas).toBe(2);
    expect(risco.faturamentoMes).toBe(500);
    expect(risco.faturamentoMesAnterior).toBe(1000);
  });

  it('org saudável → risco 0/ok e contadores zerados', async () => {
    const { carteiraResumo } = await import('@/modules/analista/carteira-data.repository');
    const resumo = await carteiraResumo(asAccess(analistaId, 'analista'), agora);
    const saudavel = resumo.find((r) => r.orgId === orgSaudavelId)!;

    expect(saudavel).toBeDefined();
    expect(saudavel.risco).toEqual({ score: 0, nivel: 'ok', motivos: [] });
    expect(saudavel.tasksAbertas).toBe(0);
    expect(saudavel.tasksAtrasadas).toBe(0);
    expect(saudavel.pendentesRevisao).toBe(0);
    expect(saudavel.faturamentoMes).toBe(300);
    expect(saudavel.faturamentoMesAnterior).toBe(0);
  });

  it('kpisDaCarteira soma os resumos e calcula variação % do faturamento', async () => {
    const { carteiraResumo, kpisDaCarteira } = await import('@/modules/analista/carteira-data.repository');
    const resumo = await carteiraResumo(asAccess(analistaId, 'analista'), agora);
    const kpis = kpisDaCarteira(resumo);

    expect(kpis.totalOrgs).toBe(2);
    expect(kpis.faturamentoMes).toBe(800); // 500 + 300
    expect(kpis.faturamentoMesAnterior).toBe(1000); // 1000 + 0
    expect(kpis.variacaoFaturamentoPct).toBe(-20); // (800-1000)/1000 = -20%
    expect(kpis.tasksAbertas).toBe(2);
    expect(kpis.tasksAtrasadas).toBe(1);
    expect(kpis.pendentesRevisao).toBe(1);
    expect(kpis.orgsEmRisco).toBe(1);
  });
});
