import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/client';
import { connections, notifications, organizations, users } from '@/db/schema';
import { encryptSecret } from '@/modules/crypto/crypto';
import { blingProvider } from '@/modules/providers/bling/provider';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-renewal-';
const HORA = 3_600_000;

describe.skipIf(!url)('renovação proativa de tokens Bling — integração', () => {
  let orgId = '';
  let userId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}${RUN}@example.com`, senha_hash: 'h', role: 'client' })
      .returning({ id: users.id });
    userId = user!.id;
    // Conexão ok expirando em 12h (dentro da margem de 24h)
    await db.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: encryptSecret('tok-antigo'),
      refresh_token: encryptSecret('rt-antigo'),
      status: 'ok',
      expira_em: new Date(Date.now() + 12 * HORA),
    });
  });

  afterAll(async () => {
    try {
      await db.delete(notifications).where(eq(notifications.user_id, userId));
      await db.delete(connections).where(eq(connections.org_id, orgId));
      await db.delete(users).where(eq(users.org_id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('listConnectionsExpirando inclui conexão que expira em <24h e exclui com margem de 1h', async () => {
    const { listConnectionsExpirando } = await import(
      '@/modules/connections/connection.repository'
    );
    expect(await listConnectionsExpirando(24 * HORA)).toContain(orgId);
    expect(await listConnectionsExpirando(1 * HORA)).not.toContain(orgId);
  });

  it('renovarConexaoDaOrg renova o token (refresh ok) e mantém status ok', async () => {
    const refreshSpy = vi.spyOn(blingProvider, 'refresh').mockResolvedValueOnce({
      accessToken: 'tok-novo',
      refreshToken: 'rt-novo',
      expiresInSeconds: 6 * 3600,
    });
    try {
      const { renovarConexaoDaOrg } = await import('@/modules/connections/token-renewal');
      const resultado = await renovarConexaoDaOrg(orgId);
      expect(resultado).toBe('renovada');
      expect(refreshSpy).toHaveBeenCalledWith('rt-antigo');

      const [conn] = await db
        .select({ status: connections.status, expira: connections.expira_em })
        .from(connections)
        .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')));
      expect(conn!.status).toBe('ok');
      expect(conn!.expira!.getTime()).toBeGreaterThan(Date.now() + 5 * HORA);
    } finally {
      refreshSpy.mockRestore();
    }
  });

  it('refresh falhou → status expirado + notify in-app do cliente com href /conexoes', async () => {
    const refreshSpy = vi
      .spyOn(blingProvider, 'refresh')
      .mockRejectedValueOnce(new Error('invalid_grant'));
    try {
      const { renovarConexaoDaOrg } = await import('@/modules/connections/token-renewal');
      const resultado = await renovarConexaoDaOrg(orgId);
      expect(resultado).toBe('expirada');

      const [conn] = await db
        .select({ status: connections.status })
        .from(connections)
        .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')));
      expect(conn!.status).toBe('expirado');

      const notifs = await db
        .select({ tipo: notifications.tipo, href: notifications.href })
        .from(notifications)
        .where(eq(notifications.user_id, userId));
      const aviso = notifs.find((n) => n.tipo === 'conexao_expirada');
      expect(aviso).toBeDefined();
      expect(aviso!.href).toBe('/conexoes');
    } finally {
      refreshSpy.mockRestore();
    }
  });
});
