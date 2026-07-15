import { inArray, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, tasks, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';
import type { UserAccess } from '@/modules/auth/user.types';
import { somarDias } from '@/modules/tasks/sla';
import { hojeBrt } from '@/lib/timezone';

const PREFIX = 'ta-test-meudia-';
const asAccess = (id: string, role: UserAccess['role'], orgId: string): UserAccess =>
  ({ id, orgId, role, orgStatus: 'active', plano: null }) as UserAccess;

describe.skipIf(!process.env.DATABASE_URL_TEST)('meu dia do analista + carteira sem N+1', () => {
  let org1Id = '';
  let org2Id = '';
  let orgForaId = '';
  let analistaId = '';
  const taskIds: string[] = [];
  let taskAtrasadaId = '';
  let taskVencendoId = '';
  let taskRevisaoId = '';
  let taskParadaId = '';
  let taskForaCarteiraId = '';

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');
    const [o1] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org1`, status: 'active' })
      .returning({ id: organizations.id });
    const [o2] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org2`, status: 'active' })
      .returning({ id: organizations.id });
    const [oFora] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}fora`, status: 'active' })
      .returning({ id: organizations.id });
    org1Id = o1.id;
    org2Id = o2.id;
    orgForaId = oFora.id;

    const [an] = await db
      .insert(users)
      .values({ org_id: org1Id, email: `${PREFIX}an@example.com`, senha_hash, role: 'analista' })
      .returning({ id: users.id });
    analistaId = an.id;

    // carteira do analista = org1 + org2 (orgFora fica de fora de propósito)
    await db
      .update(organizations)
      .set({ analista_id: analistaId })
      .where(inArray(organizations.id, [org1Id, org2Id]));

    // org1: 1 atrasada + 1 vencendo em 3d + 1 em revisão
    const [tAtrasada] = await db
      .insert(tasks)
      .values({
        org_id: org1Id, titulo: `${PREFIX}atrasada`, tipo: 'outro', prioridade: 'media',
        status: 'todo', prazo: '2020-01-01', criado_por: 'analista',
      })
      .returning({ id: tasks.id });
    taskAtrasadaId = tAtrasada.id;

    const [tVencendo] = await db
      .insert(tasks)
      .values({
        org_id: org1Id, titulo: `${PREFIX}vencendo`, tipo: 'outro', prioridade: 'media',
        status: 'em_andamento', prazo: somarDias(hojeBrt(), 3), criado_por: 'analista',
      })
      .returning({ id: tasks.id });
    taskVencendoId = tVencendo.id;

    const [tRevisao] = await db
      .insert(tasks)
      .values({
        org_id: org1Id, titulo: `${PREFIX}revisao`, tipo: 'outro', prioridade: 'media',
        status: 'em_revisao', criado_por: 'cliente',
      })
      .returning({ id: tasks.id });
    taskRevisaoId = tRevisao.id;

    // org2: 1 parada há 20 dias (updated_at tem $onUpdateFn — envelhecer via SQL cru)
    const [tParada] = await db
      .insert(tasks)
      .values({
        org_id: org2Id, titulo: `${PREFIX}parada`, tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista',
      })
      .returning({ id: tasks.id });
    taskParadaId = tParada.id;
    await db.execute(
      sql`UPDATE tasks SET updated_at = now() - interval '20 days' WHERE id = ${taskParadaId}`,
    );

    // orgFora: em revisão FORA da carteira — não pode vazar pro analista
    const [tFora] = await db
      .insert(tasks)
      .values({
        org_id: orgForaId, titulo: `${PREFIX}fora`, tipo: 'outro', prioridade: 'media',
        status: 'em_revisao', prazo: '2020-01-01', criado_por: 'cliente',
      })
      .returning({ id: tasks.id });
    taskForaCarteiraId = tFora.id;

    taskIds.push(taskAtrasadaId, taskVencendoId, taskRevisaoId, taskParadaId, taskForaCarteiraId);
  });

  afterAll(async () => {
    await db.delete(tasks).where(inArray(tasks.id, taskIds));
    // organizations.analista_id referencia users.id (sem ON DELETE) — limpar
    // antes de apagar o usuário, senão a FK bloqueia o delete.
    await db
      .update(organizations)
      .set({ analista_id: null })
      .where(like(organizations.name, `${PREFIX}%`));
    await db.delete(users).where(inArray(users.id, [analistaId].filter(Boolean)));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('getMeuDia agrega as 4 listas cross-org da carteira', async () => {
    const { getMeuDia } = await import('@/modules/analista/analista.repository');
    const meuDia = await getMeuDia(asAccess(analistaId, 'analista', org1Id));
    expect(meuDia.atrasadas.map((t) => t.taskId)).toContain(taskAtrasadaId);
    expect(meuDia.vencem7d.map((t) => t.taskId)).toContain(taskVencendoId);
    expect(meuDia.emRevisao.map((t) => t.taskId)).toContain(taskRevisaoId);
    expect(meuDia.semAtividade14d.map((t) => t.taskId)).toContain(taskParadaId);
    // atrasada NÃO entra em vencem7d
    expect(meuDia.vencem7d.map((t) => t.taskId)).not.toContain(taskAtrasadaId);
    // itens carregam org e prazo p/ deep-link e rótulo
    const atrasada = meuDia.atrasadas.find((t) => t.taskId === taskAtrasadaId);
    expect(atrasada).toMatchObject({ orgId: org1Id, orgName: `${PREFIX}org1`, prazo: '2020-01-01' });
  });

  it('getMeuDia(analista) não vaza task de org fora da carteira', async () => {
    const { getMeuDia } = await import('@/modules/analista/analista.repository');
    const meuDia = await getMeuDia(asAccess(analistaId, 'analista', org1Id));
    const todas = [
      ...meuDia.atrasadas,
      ...meuDia.vencem7d,
      ...meuDia.emRevisao,
      ...meuDia.semAtividade14d,
    ].map((t) => t.taskId);
    expect(todas).not.toContain(taskForaCarteiraId);
  });

  it('getMeuDia(admin) enxerga inclusive a org sem analista', async () => {
    const { getMeuDia } = await import('@/modules/analista/analista.repository');
    const meuDia = await getMeuDia(asAccess('qualquer', 'admin_truth', org1Id));
    expect(meuDia.emRevisao.map((t) => t.taskId)).toContain(taskForaCarteiraId);
  });

  it('getCarteira ordena por criticidade e conta atrasadas em BRT', async () => {
    const { getCarteira } = await import('@/modules/analista/analista.repository');
    const carteira = await getCarteira(asAccess(analistaId, 'analista', org1Id));
    // escopo do assert: só as orgs da suíte — o branch `test` é compartilhado
    const nossas = carteira.filter((c) => [org1Id, org2Id].includes(c.orgId));
    expect(nossas).toHaveLength(2);
    expect(nossas[0]!.orgId).toBe(org1Id); // 1 atrasada > 0 atrasadas
    expect(nossas[0]!.atrasadas).toBe(1);
    expect(nossas[0]!.emRevisao).toBe(1);
    expect(nossas[1]!.orgId).toBe(org2Id);
    expect(nossas[1]!.atrasadas).toBe(0);
    // counts por status continuam no shape antigo
    expect(nossas[0]!.counts.todo).toBe(1);
    expect(nossas[0]!.counts.em_andamento).toBe(1);
    expect(nossas[0]!.counts.em_revisao).toBe(1);
    expect(nossas[1]!.counts.todo).toBe(1);
  });
});
