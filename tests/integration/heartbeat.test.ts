import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { cronHeartbeats } from '@/db/schema';
import { listHeartbeats, registrarHeartbeat } from '@/modules/admin/heartbeat.repository';

/**
 * Heartbeat de crons (Task 9/H4) — repo isolado por rotas de teste distintas
 * (rota é a própria PK; sem org_id para escopar). Limpa no afterAll.
 */
const url = process.env.DATABASE_URL_TEST;
const PREFIX = 'ta-test-hb-';
const RUN = Date.now();

describe.skipIf(!url)('heartbeat de crons — integração', () => {
  const rota = `${PREFIX}rota-${RUN}`;
  const rotaGigante = 'x'.repeat(100); // > varchar(64) — dispara erro real de DB

  afterAll(async () => {
    await db.delete(cronHeartbeats).where(eq(cronHeartbeats.rota, rota));
    // rotaGigante nunca chega a ser inserida (erro engolido) — nada a limpar,
    // mas o delete é inofensivo caso o comportamento mude no futuro.
    await db.delete(cronHeartbeats).where(eq(cronHeartbeats.rota, rotaGigante));
  });

  it('upsert por rota: 2ª chamada na mesma rota atualiza a única linha (não duplica)', async () => {
    await registrarHeartbeat(rota, true, { tentativa: 1 });

    let linhas = await db.select().from(cronHeartbeats).where(eq(cronHeartbeats.rota, rota));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.ok).toBe(true);
    expect(linhas[0]!.detalhes).toEqual({ tentativa: 1 });
    const primeiraExecucao = linhas[0]!.executado_em.getTime();

    await new Promise((r) => setTimeout(r, 5));
    await registrarHeartbeat(rota, false, { tentativa: 2, erro: 'timeout' });

    linhas = await db.select().from(cronHeartbeats).where(eq(cronHeartbeats.rota, rota));
    expect(linhas).toHaveLength(1); // upsert — não duplicou
    expect(linhas[0]!.ok).toBe(false);
    expect(linhas[0]!.detalhes).toEqual({ tentativa: 2, erro: 'timeout' });
    expect(linhas[0]!.executado_em.getTime()).toBeGreaterThan(primeiraExecucao);
  });

  it('listHeartbeats() retorna a linha registrada', async () => {
    const todas = await listHeartbeats();
    const minha = todas.find((h) => h.rota === rota);
    expect(minha).toBeDefined();
    expect(minha!.ok).toBe(false);
  });

  it('erro de banco (rota excede varchar(64)) é engolido — nunca lança e não deixa linha', async () => {
    await expect(registrarHeartbeat(rotaGigante, true, {})).resolves.toBeUndefined();

    const linhas = await db
      .select()
      .from(cronHeartbeats)
      .where(eq(cronHeartbeats.rota, rotaGigante));
    expect(linhas).toHaveLength(0);
  });
});
