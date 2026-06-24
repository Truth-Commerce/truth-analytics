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
