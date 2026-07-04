import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, organizations, users } from '@/db/schema';
import { assertOrgAccess, listAnalistas, setOrgAnalista } from '@/modules/analista/analista.repository';
import { hashPassword } from '@/modules/auth/password';
import type { UserAccess } from '@/modules/auth/user.types';

const PREFIX = 'ta-test-carteira-';
const asAccess = (id: string, role: UserAccess['role']): UserAccess =>
  ({ id, orgId: 'x', role, orgStatus: 'active', plano: null }) as UserAccess;

describe.skipIf(!process.env.DATABASE_URL_TEST)('carteira do analista', () => {
  let orgA = '';
  let orgB = '';
  let analistaId = '';
  const userIds: string[] = [];

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');
    const [a] = await db.insert(organizations).values({ name: `${PREFIX}A`, status: 'active' }).returning({ id: organizations.id });
    const [b] = await db.insert(organizations).values({ name: `${PREFIX}B`, status: 'active' }).returning({ id: organizations.id });
    orgA = a.id; orgB = b.id;
    const [an] = await db.insert(users).values({ org_id: orgA, email: `${PREFIX}an@example.com`, senha_hash, role: 'analista' }).returning({ id: users.id });
    analistaId = an.id; userIds.push(an.id);
    await setOrgAnalista({ orgId: orgA, analistaUserId: analistaId, actorUserId: analistaId });
  });

  afterAll(async () => {
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
});
