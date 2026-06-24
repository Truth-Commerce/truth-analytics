import { and, eq, gte, sql as dsql } from 'drizzle-orm';

import { db } from '@/db/client';
import { loginAttempts } from '@/db/schema';
import { normalizeEmail } from '@/modules/auth/user.repository';

const MAX_FAILURES = 5;
const MAX_FAILURES_PER_EMAIL = 20;
const WINDOW_MINUTES = 15;

export async function recordLoginAttempt(input: {
  email: string;
  ip: string | null;
  success: boolean;
}): Promise<void> {
  await db.insert(loginAttempts).values({
    email: normalizeEmail(input.email),
    ip: input.ip,
    success: input.success,
  });
}

export async function countRecentFailures(
  email: string,
  ip: string | null,
  windowMinutes: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const normalized = normalizeEmail(email);
  const where = ip
    ? and(
        eq(loginAttempts.email, normalized),
        eq(loginAttempts.ip, ip),
        eq(loginAttempts.success, false),
        gte(loginAttempts.created_at, since),
      )
    : and(
        eq(loginAttempts.email, normalized),
        eq(loginAttempts.success, false),
        gte(loginAttempts.created_at, since),
      );
  const [row] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(where);
  return row?.n ?? 0;
}

export async function isLoginRateLimited(
  email: string,
  ip: string | null,
): Promise<boolean> {
  const perIp = await countRecentFailures(email, ip, WINDOW_MINUTES);
  if (perIp >= MAX_FAILURES) return true;
  // Defesa contra rotação de X-Forwarded-For: contador por e-mail (todos os IPs).
  const perEmail = await countRecentFailures(email, null, WINDOW_MINUTES);
  return perEmail >= MAX_FAILURES_PER_EMAIL;
}
