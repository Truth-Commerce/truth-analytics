import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Sem contexto de request nos testes: `headers()` precisa de um stub. Segue o
// mesmo padrão de tests/unit/auth-actions-zod.test.ts.
vi.mock('next/headers', () => ({ headers: () => new Headers() }));

import { db } from '@/db/client';
import { organizations, passwordResetTokens, users } from '@/db/schema';
import {
  consumeResetToken,
  createPasswordResetToken,
} from '@/modules/auth/password-reset.repository';
import { flushPasswordResetTasks } from '@/modules/auth/password-reset.dispatch';
import { recordAttempt } from '@/modules/auth/rate-limit';
import {
  requestPasswordResetAction,
  resetPasswordAction,
} from '@/actions/password-reset.actions';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

function isNextRedirect(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { digest?: unknown }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

describe.skipIf(!process.env.DATABASE_URL_TEST)('password reset actions', () => {
  let orgId: string;
  let userId: string;
  const email = `t_pra_${randomUUID().slice(0, 8)}@teste.dev`;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `t_pra_${randomUUID().slice(0, 8)}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;
    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email, senha_hash: 'antigo-hash', role: 'client' })
      .returning({ id: users.id });
    userId = user.id;
  });

  afterAll(async () => {
    await flushPasswordResetTasks();
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, userId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('anti-enumeração: resposta IDÊNTICA para existente, inexistente e rate-limited', async () => {
    const existente = await requestPasswordResetAction({}, form({ email }));
    const inexistente = await requestPasswordResetAction(
      {},
      form({ email: `nao_existe_${randomUUID().slice(0, 8)}@teste.dev` }),
    );
    await flushPasswordResetTasks();

    // Mesma resposta exata (mesmo objeto/mensagem) nos dois caminhos.
    expect(existente).toEqual({ ok: true });
    expect(inexistente).toEqual({ ok: true });
    expect(existente).toEqual(inexistente);

    // Estoura o rate-limit por e-mail (RESET_MAX_PER_EMAIL = 3) e confirma que a
    // resposta continua idêntica — o rate-limit também não é observável.
    for (let i = 0; i < 3; i += 1) {
      await recordAttempt({ escopo: 'reset', email, ip: null, success: true });
    }
    const limitado = await requestPasswordResetAction({}, form({ email }));
    expect(limitado).toEqual({ ok: true });
    expect(limitado).toEqual(existente);
  });

  it('redefinir invalida os OUTROS tokens abertos do usuário', async () => {
    const t1 = await createPasswordResetToken(email);
    const t2 = await createPasswordResetToken(email);
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(t2).toMatch(/^[0-9a-f]{64}$/);

    // Redefine usando t2; a action redireciona (throw NEXT_REDIRECT) em sucesso.
    let redirecionou = false;
    try {
      await resetPasswordAction({}, form({ token: t2!, senha: 'senha-nova-abc123' }));
    } catch (err) {
      redirecionou = isNextRedirect(err);
      if (!redirecionou) throw err;
    }
    expect(redirecionou).toBe(true);

    // Nenhum token do usuário permanece aberto (t1 e t2 foram marcados usados).
    const linhas = await db
      .select({ usado_em: passwordResetTokens.usado_em })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.user_id, userId));
    expect(linhas.length).toBeGreaterThanOrEqual(2);
    expect(linhas.every((l) => l.usado_em !== null)).toBe(true);

    // O outro token (t1) não pode mais ser consumido.
    expect(await consumeResetToken(t1!, 'mais-uma-senha-999')).toBe(false);
  });
});
