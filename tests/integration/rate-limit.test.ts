import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { loginAttempts } from '@/db/schema';
import {
  countRecentFailures,
  isLoginRateLimited,
  recordLoginAttempt,
} from '@/modules/auth/rate-limit';

const MAX_FAILURES_PER_EMAIL = 20;

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const RUN = Date.now();
const email = `ratelimit-${RUN}@ta-test-admin.example.com`;
const ip = '203.0.113.7';

describe.skipIf(!url)('rate-limit de login', () => {
  afterAll(async () => {
    await tdb.delete(loginAttempts).where(eq(loginAttempts.email, email));
    await sql.end();
  });

  it('não bloqueia abaixo do limite', async () => {
    for (let i = 0; i < 4; i++) {
      await recordLoginAttempt({ email, ip, success: false });
    }
    expect(await countRecentFailures(email, ip, 15)).toBe(4);
    expect(await isLoginRateLimited(email, ip)).toBe(false);
  });

  it('bloqueia ao atingir 5 falhas na janela', async () => {
    await recordLoginAttempt({ email, ip, success: false });
    expect(await isLoginRateLimited(email, ip)).toBe(true);
  });

  it('sucesso não conta como falha', async () => {
    const other = `ok-${RUN}@ta-test-admin.example.com`;
    await recordLoginAttempt({ email: other, ip, success: true });
    expect(await countRecentFailures(other, ip, 15)).toBe(0);
    await tdb.delete(loginAttempts).where(eq(loginAttempts.email, other));
  });
});

describe.skipIf(!url)('rate-limit de login com ip=null', () => {
  const emailNullIp = `nullip-${Date.now()}@ta-test-admin.example.com`;
  const sql3 = postgres(url ?? '', { prepare: false });
  const tdb3 = drizzle(sql3);

  afterAll(async () => {
    await tdb3.delete(loginAttempts).where(eq(loginAttempts.email, emailNullIp));
    await sql3.end();
  });

  it('ip=null: bloqueia aos 5 por e-mail (comportamento antigo preservado)', async () => {
    for (let i = 0; i < 4; i++) {
      await recordLoginAttempt({ email: emailNullIp, ip: null, success: false });
    }
    expect(await isLoginRateLimited(emailNullIp, null)).toBe(false);
    await recordLoginAttempt({ email: emailNullIp, ip: null, success: false });
    expect(await isLoginRateLimited(emailNullIp, null)).toBe(true);
  });
});

describe.skipIf(!url)('rate-limit por e-mail (defesa contra rotação de XFF)', () => {
  const emailXff = `xff-${RUN}@ta-test-admin.example.com`;
  // Conexão própria para não depender do sql/tdb do describe anterior (que fecha após afterAll)
  const sql2 = postgres(url ?? '', { prepare: false });
  const tdb2 = drizzle(sql2);

  afterAll(async () => {
    await tdb2.delete(loginAttempts).where(eq(loginAttempts.email, emailXff));
    await sql2.end();
  });

  it('bloqueia quando o limite por e-mail é atingido mesmo com IPs diferentes', async () => {
    // Abaixo do limite: 10 falhas distribuídas em 10 IPs distintos
    for (let i = 0; i < 10; i++) {
      await recordLoginAttempt({
        email: emailXff,
        ip: `198.51.100.${i}`,
        success: false,
      });
    }
    // Nenhum par (email+ip) atingiu MAX_FAILURES=5, e total < MAX_FAILURES_PER_EMAIL=20
    expect(await isLoginRateLimited(emailXff, '198.51.100.250')).toBe(false);

    // Completa até MAX_FAILURES_PER_EMAIL: mais 10 falhas em mais 10 IPs distintos
    for (let i = 10; i < MAX_FAILURES_PER_EMAIL; i++) {
      await recordLoginAttempt({
        email: emailXff,
        ip: `198.51.100.${i}`,
        success: false,
      });
    }
    // Agora total == 20: deve bloquear mesmo com IP nunca visto
    expect(await isLoginRateLimited(emailXff, '198.51.100.250')).toBe(true);
  });
});
