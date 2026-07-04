import { and, eq, gte, sql as dsql } from 'drizzle-orm';

import { db } from '@/db/client';
import { loginAttempts } from '@/db/schema';
import { normalizeEmail } from '@/modules/auth/user.repository';

const MAX_FAILURES = 5;
const MAX_FAILURES_PER_EMAIL = 20;
const WINDOW_MINUTES = 15;

const SIGNUP_MAX_PER_IP = 5;
const SIGNUP_WINDOW_MINUTES = 60;

const RESET_MAX_PER_EMAIL = 3;
const RESET_MAX_PER_IP = 10;
const RESET_WINDOW_MINUTES = 15;

export type EscopoRateLimit = 'login' | 'signup' | 'reset';

export async function recordAttempt(input: {
  escopo: EscopoRateLimit;
  email: string;
  ip: string | null;
  success: boolean;
}): Promise<void> {
  await db.insert(loginAttempts).values({
    escopo: input.escopo,
    email: normalizeEmail(input.email),
    ip: input.ip,
    success: input.success,
  });
}

type CountFilter = {
  escopo: EscopoRateLimit;
  email?: string;
  ip?: string;
  apenasFalhas: boolean;
  windowMinutes: number;
};

async function countRecent(filter: CountFilter): Promise<number> {
  const since = new Date(Date.now() - filter.windowMinutes * 60_000);
  const conds = [
    eq(loginAttempts.escopo, filter.escopo),
    gte(loginAttempts.created_at, since),
  ];
  if (filter.email !== undefined) conds.push(eq(loginAttempts.email, normalizeEmail(filter.email)));
  if (filter.ip !== undefined) conds.push(eq(loginAttempts.ip, filter.ip));
  if (filter.apenasFalhas) conds.push(eq(loginAttempts.success, false));

  const [row] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(...conds));
  return row?.n ?? 0;
}

// --- LOGIN (comportamento existente preservado) ---

export async function recordLoginAttempt(input: {
  email: string;
  ip: string | null;
  success: boolean;
}): Promise<void> {
  await recordAttempt({ escopo: 'login', ...input });
}

// Preservado para compatibilidade com os testes de rate-limit de login.
export async function countRecentFailures(
  email: string,
  ip: string | null,
  windowMinutes: number,
): Promise<number> {
  return countRecent({
    escopo: 'login',
    email,
    ...(ip ? { ip } : {}),
    apenasFalhas: true,
    windowMinutes,
  });
}

export async function isLoginRateLimited(
  email: string,
  ip: string | null,
): Promise<boolean> {
  if (ip) {
    const perIp = await countRecent({
      escopo: 'login', email, ip, apenasFalhas: true, windowMinutes: WINDOW_MINUTES,
    });
    if (perIp >= MAX_FAILURES) return true;
  }
  // Defesa contra rotação de X-Forwarded-For: contador por e-mail (todos os IPs).
  const perEmail = await countRecent({
    escopo: 'login', email, apenasFalhas: true, windowMinutes: WINDOW_MINUTES,
  });
  return perEmail >= MAX_FAILURES_PER_EMAIL;
}

// --- SIGNUP ---

export async function isSignupRateLimited(ip: string | null): Promise<boolean> {
  if (!ip) return false; // fail-open explícito: sem IP não há chave de contagem
  const n = await countRecent({
    escopo: 'signup', ip, apenasFalhas: false, windowMinutes: SIGNUP_WINDOW_MINUTES,
  });
  return n >= SIGNUP_MAX_PER_IP;
}

// --- RESET DE SENHA (consumido pela Task 13) ---

export async function isResetRateLimited(
  email: string,
  ip: string | null,
): Promise<boolean> {
  const perEmail = await countRecent({
    escopo: 'reset', email, apenasFalhas: false, windowMinutes: RESET_WINDOW_MINUTES,
  });
  if (perEmail >= RESET_MAX_PER_EMAIL) return true;
  if (!ip) return false;
  const perIp = await countRecent({
    escopo: 'reset', ip, apenasFalhas: false, windowMinutes: RESET_WINDOW_MINUTES,
  });
  return perIp >= RESET_MAX_PER_IP;
}
