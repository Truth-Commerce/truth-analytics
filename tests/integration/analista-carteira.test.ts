import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, organizations, tasks, users } from '@/db/schema';
import {
  assertOrgAccess,
  getCarteira,
  listAnalistas,
  listTasksEmRevisao,
  setOrgAnalista,
} from '@/modules/analista/analista.repository';
import { hashPassword } from '@/modules/auth/password';
import type { UserAccess } from '@/modules/auth/user.types';

const PREFIX = 'ta-test-carteira-';
const asAccess = (id: string, role: UserAccess['role']): UserAccess =>
  ({ id, orgId: 'x', role, orgStatus: 'active', plano: null }) as UserAccess;

function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!process.env.DATABASE_URL_TEST)('carteira do analista', () => {
  let orgA = '';
  let orgB = '';
  let analistaId = '';
  const userIds: string[] = [];
  const taskIds: string[] = [];
  let taskAtrasadaAId = '';
  let taskRevisaoAId = '';
  let taskRevisaoBId = '';

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');
    const [a] = await db.insert(organizations).values({ name: `${PREFIX}A`, status: 'active' }).returning({ id: organizations.id });
    const [b] = await db.insert(organizations).values({ name: `${PREFIX}B`, status: 'active' }).returning({ id: organizations.id });
    orgA = a.id; orgB = b.id;
    const [an] = await db.insert(users).values({ org_id: orgA, email: `${PREFIX}an@example.com`, senha_hash, role: 'analista' }).returning({ id: users.id });
    analistaId = an.id; userIds.push(an.id);
    await setOrgAnalista({ orgId: orgA, analistaUserId: analistaId, actorUserId: analistaId });

    // task atrasada (prazo ontem, não concluída) na org da carteira (A)
    const [tA1] = await db
      .insert(tasks)
      .values({
        org_id: orgA, titulo: `${PREFIX}atrasada-A`, tipo: 'outro', prioridade: 'media',
        status: 'todo', prazo: diasAtras(1), criado_por: 'analista',
      })
      .returning({ id: tasks.id });
    taskAtrasadaAId = tA1.id;

    // task em_revisao na org da carteira (A) — deve aparecer na fila do analista
    const [tA2] = await db
      .insert(tasks)
      .values({ org_id: orgA, titulo: `${PREFIX}revisao-A`, tipo: 'outro', prioridade: 'media', status: 'em_revisao', criado_por: 'cliente' })
      .returning({ id: tasks.id });
    taskRevisaoAId = tA2.id;

    // task em_revisao na org FORA da carteira (B) — não deve aparecer na fila do analista
    const [tB1] = await db
      .insert(tasks)
      .values({ org_id: orgB, titulo: `${PREFIX}revisao-B`, tipo: 'outro', prioridade: 'media', status: 'em_revisao', criado_por: 'cliente' })
      .returning({ id: tasks.id });
    taskRevisaoBId = tB1.id;

    taskIds.push(taskAtrasadaAId, taskRevisaoAId, taskRevisaoBId);
  });

  afterAll(async () => {
    await db.delete(tasks).where(inArray(tasks.id, taskIds));
    await db.delete(auditLog).where(inArray(auditLog.org_id, [orgA, orgB].filter(Boolean)));
    // organizations.analista_id referencia users.id (sem ON DELETE) — precisa ser
    // limpo antes de apagar os usuários, senão a FK bloqueia o delete.
    await db
      .update(organizations)
      .set({ analista_id: null })
      .where(like(organizations.name, `${PREFIX}%`));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('analista acessa org da carteira e é barrado fora dela', async () => {
    await expect(assertOrgAccess(asAccess(analistaId, 'analista'), orgA)).resolves.toBeUndefined();
    await expect(assertOrgAccess(asAccess(analistaId, 'analista'), orgB)).rejects.toThrow('acesso_negado');
  });

  it('admin passa em qualquer org; cliente nunca passa', async () => {
    await expect(assertOrgAccess(asAccess('qualquer', 'admin_truth'), orgB)).resolves.toBeUndefined();
    await expect(assertOrgAccess(asAccess(analistaId, 'client'), orgA)).rejects.toThrow('acesso_negado');
  });

  it('listAnalistas devolve o analista; setOrgAnalista rejeita não-analista', async () => {
    const lista = await listAnalistas();
    expect(lista.some((u) => u.id === analistaId)).toBe(true);
    await expect(
      setOrgAnalista({ orgId: orgB, analistaUserId: orgB, actorUserId: analistaId }),
    ).rejects.toThrow('analista_invalido');
  });

  it('getCarteira(analista) traz só a org da carteira, com a task atrasada contada', async () => {
    const carteira = await getCarteira(asAccess(analistaId, 'analista'));
    expect(carteira).toHaveLength(1);
    expect(carteira[0].orgId).toBe(orgA);
    expect(carteira[0].atrasadas).toBe(1);
    expect(carteira[0].emRevisao).toBe(1);
  });

  it('getCarteira(admin) traz as duas orgs', async () => {
    const carteira = await getCarteira(asAccess('qualquer', 'admin_truth'));
    const ids = carteira.map((c) => c.orgId);
    expect(ids).toEqual(expect.arrayContaining([orgA, orgB]));
  });

  it('listTasksEmRevisao(analista) só traz a task em_revisao da org da carteira', async () => {
    const fila = await listTasksEmRevisao(asAccess(analistaId, 'analista'));
    const idsNaFila = fila.map((t) => t.id);
    expect(idsNaFila).toContain(taskRevisaoAId);
    expect(idsNaFila).not.toContain(taskRevisaoBId);
  });

  it('listTasksEmRevisao(admin) traz as tasks em_revisao das duas orgs', async () => {
    const fila = await listTasksEmRevisao(asAccess('qualquer', 'admin_truth'));
    const idsNaFila = fila.map((t) => t.id);
    expect(idsNaFila).toEqual(expect.arrayContaining([taskRevisaoAId, taskRevisaoBId]));
  });
});
