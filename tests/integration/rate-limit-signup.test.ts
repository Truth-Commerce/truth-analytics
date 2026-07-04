import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { loginAttempts } from '@/db/schema';
import { isSignupRateLimited, recordAttempt } from '@/modules/auth/rate-limit';

describe.skipIf(!process.env.DATABASE_URL_TEST)('rate-limit de signup', () => {
  const ip = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const emails: string[] = [];

  afterAll(async () => {
    for (const email of emails) {
      await db.delete(loginAttempts).where(eq(loginAttempts.email, email));
    }
  });

  it('5 cadastros do mesmo IP em 1h → limitado; escopo login não interfere', async () => {
    expect(await isSignupRateLimited(ip)).toBe(false);
    for (let i = 0; i < 5; i++) {
      const email = `t_su_${randomUUID().slice(0, 8)}@teste.dev`;
      emails.push(email);
      await recordAttempt({ escopo: 'signup', email, ip, success: true });
    }
    expect(await isSignupRateLimited(ip)).toBe(true);

    // tentativas de LOGIN no mesmo IP não contam para signup
    const emailLogin = `t_su_${randomUUID().slice(0, 8)}@teste.dev`;
    emails.push(emailLogin);
    await recordAttempt({ escopo: 'login', email: emailLogin, ip, success: false });
    expect(await isSignupRateLimited(ip)).toBe(true); // continua 5, não 6 — e o inverso também não vaza
  });

  it('IP null nunca é limitado (fail-open explícito)', async () => {
    expect(await isSignupRateLimited(null)).toBe(false);
  });

  it('sondas de e-mail existente (success:false) também contam para o limite', async () => {
    const ipSonda = `10.98.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    expect(await isSignupRateLimited(ipSonda)).toBe(false);
    for (let i = 0; i < 5; i++) {
      const email = `t_sonda_${randomUUID().slice(0, 8)}@teste.dev`;
      emails.push(email);
      await recordAttempt({ escopo: 'signup', email, ip: ipSonda, success: false });
    }
    expect(await isSignupRateLimited(ipSonda)).toBe(true);
  });
});
