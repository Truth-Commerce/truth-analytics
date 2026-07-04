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

    await db.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: legado,
      refresh_token: legado,
      status: 'ok',
    });

    const r1 = await reencryptConnections();
    expect(r1.atualizadas).toBeGreaterThanOrEqual(1);

    const [row] = await db
      .select({ access_token: connections.access_token })
      .from(connections)
      .where(eq(connections.org_id, orgId));
    expect(encryptionKeyIdOf(row.access_token!)).toBe('k2');
    expect(decryptSecret(row.access_token!)).toBe('token-legado');

    const r2 = await reencryptConnections();
    // nossa linha já está em k2 — não é re-atualizada
    const [row2] = await db
      .select({ access_token: connections.access_token })
      .from(connections)
      .where(eq(connections.org_id, orgId));
    expect(row2.access_token).toBe(row.access_token);
    expect(r2.total).toBeGreaterThanOrEqual(1);
  });
});
