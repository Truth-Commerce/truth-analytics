/**
 * Re-encripta access_token/refresh_token de `connections` com a chave ATIVA
 * (ENCRYPTION_KEY_ACTIVE). Idempotente: payloads já na chave ativa são pulados.
 *
 * Uso (runbook de rotação, DEPOIS do versionamento em produção):
 *   npm run db:reencrypt
 */
import { eq } from 'drizzle-orm';

import { db } from '../src/db/client';
import { connections } from '../src/db/schema';
import { serverEnv } from '../src/lib/env';
import { decryptSecret, encryptSecret, encryptionKeyIdOf } from '../src/modules/crypto/crypto';

export async function reencryptConnections(): Promise<{ total: number; atualizadas: number }> {
  const ativa = serverEnv.ENCRYPTION_KEY_ACTIVE;
  if (!serverEnv.ENCRYPTION_KEYS || !ativa) {
    throw new Error('Configure ENCRYPTION_KEYS e ENCRYPTION_KEY_ACTIVE antes de reencriptar.');
  }

  const rows = await db
    .select({
      id: connections.id,
      access_token: connections.access_token,
      refresh_token: connections.refresh_token,
    })
    .from(connections);

  let atualizadas = 0;
  let falhas = 0;
  for (const row of rows) {
    try {
      const set: { access_token?: string; refresh_token?: string } = {};
      if (row.access_token && encryptionKeyIdOf(row.access_token) !== ativa) {
        set.access_token = encryptSecret(decryptSecret(row.access_token));
      }
      if (row.refresh_token && encryptionKeyIdOf(row.refresh_token) !== ativa) {
        set.refresh_token = encryptSecret(decryptSecret(row.refresh_token));
      }
      if (Object.keys(set).length === 0) continue;
      await db.update(connections).set(set).where(eq(connections.id, row.id));
      atualizadas++;
    } catch {
      // Uma linha que não decifra (chave desconhecida/corrompida) NÃO deve abortar a
      // migração inteira nem ter seu payload tocado: registra o id e segue. O operador
      // do runbook investiga se `falhas` vier > 0.
      falhas++;
      console.warn(JSON.stringify({ msg: 'reencrypt: linha ignorada (falha ao decifrar)', id: row.id }));
    }
  }

  const resultado = { total: rows.length, atualizadas };
  console.log(JSON.stringify({ msg: 'reencrypt concluído', ...resultado, falhas }));
  return resultado;
}

// Entrypoint CLI (não roda quando importado pelos testes)
if (process.argv[1]?.includes('reencrypt-connections')) {
  reencryptConnections()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
