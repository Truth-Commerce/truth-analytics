import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';

// vi.hoisted: vi.mock é içado ao topo do arquivo; para o factory enxergar as
// chaves elas precisam ser definidas num bloco também içado (senão TDZ: "Cannot
// access 'KEY_A' before initialization").
const { KEY_A, KEY_B } = vi.hoisted(() => ({
  KEY_A: Buffer.alloc(32, 7).toString('base64'),
  KEY_B: Buffer.alloc(32, 9).toString('base64'),
}));

vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: {
      ...mod.serverEnv,
      ENCRYPTION_KEY: KEY_A, // chave legada ainda presente (retrocompat)
      ENCRYPTION_KEYS: { k1: KEY_A, k2: KEY_B },
      ENCRYPTION_KEY_ACTIVE: 'k2',
    },
  };
});

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';
import { decryptSecret, encryptionKeyIdOf } from '@/modules/crypto/crypto';
import { reencryptConnections } from '../../scripts/reencrypt-connections';

// O banco de teste é COMPARTILHADO entre arquivos rodando em paralelo: outros testes
// inserem `connections` cifradas com a ENCRYPTION_KEY real (indecifráveis sob o chaveiro
// mockado deste arquivo), então o contador GLOBAL `falhas` não é deterministicamente 0.
// A asserção correta e à prova de corrida é: `falhas` bate com as linhas logadas como
// ignoradas, e NENHUMA delas é nossa (nossas linhas decifráveis contribuem 0 falhas).
function idsIgnorados(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((c) => String(c[0]))
    .filter((s) => s.includes('linha ignorada'))
    .map((s) => (JSON.parse(s) as { id: string }).id);
}

describe.skipIf(!process.env.DATABASE_URL_TEST)('reencrypt-connections', () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) {
      await db.delete(connections).where(eq(connections.org_id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
  });

  it('migra payload legado para v1:k2 e mantém o plaintext; 2ª rodada é no-op', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `t_re_${randomUUID().slice(0, 8)}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;

    // Payload LEGADO: cifrado com KEY_A no formato iv.tag.ct (gerado manualmente)
    const { createCipheriv, randomBytes } = await import('node:crypto');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(KEY_A, 'base64'), iv);
    const ct = Buffer.concat([cipher.update('token-legado', 'utf8'), cipher.final()]);
    const legado = [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');

    const [conn] = await db
      .insert(connections)
      .values({
        org_id: orgId,
        provider: 'bling',
        access_token: legado,
        refresh_token: legado,
        status: 'ok',
      })
      .returning({ id: connections.id });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r1 = await reencryptConnections();
    expect(r1.atualizadas).toBeGreaterThanOrEqual(1);
    // Nossa linha (decifrável) contribui 0 falhas; o contador bate com o log.
    expect(idsIgnorados(warnSpy)).not.toContain(conn.id);
    expect(r1.falhas).toBe(idsIgnorados(warnSpy).length);

    const [row] = await db
      .select({ access_token: connections.access_token })
      .from(connections)
      .where(eq(connections.org_id, orgId));
    expect(encryptionKeyIdOf(row.access_token!)).toBe('k2');
    expect(decryptSecret(row.access_token!)).toBe('token-legado');

    warnSpy.mockClear();
    const r2 = await reencryptConnections();
    // nossa linha já está em k2 — não é re-atualizada
    const [row2] = await db
      .select({ access_token: connections.access_token })
      .from(connections)
      .where(eq(connections.org_id, orgId));
    expect(row2.access_token).toBe(row.access_token);
    expect(r2.total).toBeGreaterThanOrEqual(1);
    expect(idsIgnorados(warnSpy)).not.toContain(conn.id);
    expect(r2.falhas).toBe(idsIgnorados(warnSpy).length);
    warnSpy.mockRestore();
  });

  it('linha indecifrável entra em falhas e NÃO é tocada (gate do exit code)', async () => {
    // Payload inválido inserido direto no banco (não decifra com nenhuma chave).
    const invalido = 'payload-invalido-sem-formato';
    const [conn] = await db
      .insert(connections)
      .values({
        org_id: orgId,
        provider: 'invalido',
        access_token: invalido,
        refresh_token: invalido,
        status: 'erro',
      })
      .returning({ id: connections.id });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await reencryptConnections();
    // `falhas` é o valor que o entrypoint CLI usa para o exit code (falhas>0 → exit 1).
    expect(r.falhas).toBeGreaterThanOrEqual(1);
    expect(idsIgnorados(warnSpy)).toContain(conn.id);
    warnSpy.mockRestore();

    const [row] = await db
      .select({ access_token: connections.access_token, refresh_token: connections.refresh_token })
      .from(connections)
      .where(eq(connections.provider, 'invalido'));
    expect(row.access_token).toBe(invalido);
    expect(row.refresh_token).toBe(invalido);

    // Limpa a linha inválida aqui para não poluir re-execuções deste arquivo.
    await db.delete(connections).where(eq(connections.provider, 'invalido'));
  });
});
