import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { passwordResetTokens, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';
import { getUserByEmail } from '@/modules/auth/user.repository';

const EXPIRACAO_MINUTOS = 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Cria um token de reset (64 hex) para o e-mail, se existir usuário.
 * Persiste APENAS o sha256 (vazamento do banco não vaza o link).
 * Retorna null quando o e-mail não existe — o chamador DEVE responder
 * exatamente igual nos dois casos (anti-enumeração).
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;

  const token = randomBytes(32).toString('hex');
  await db.insert(passwordResetTokens).values({
    user_id: user.id,
    token_hash: hashToken(token),
    expira_em: new Date(Date.now() + EXPIRACAO_MINUTOS * 60_000),
  });
  return token;
}

/**
 * Consome o token (single-use) e troca a senha ATOMICAMENTE:
 * o UPDATE de usado_em com filtro `usado_em IS NULL` é a barreira contra corrida —
 * se outra requisição consumiu primeiro, retorna false sem trocar a senha.
 */
export async function consumeResetToken(token: string, novaSenha: string): Promise<boolean> {
  const agora = new Date();
  const [valido] = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.user_id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token_hash, hashToken(token)),
        gt(passwordResetTokens.expira_em, agora),
        isNull(passwordResetTokens.usado_em),
      ),
    )
    .limit(1);
  if (!valido) return false;

  const senha_hash = await hashPassword(novaSenha);

  return db.transaction(async (tx) => {
    const marcado = await tx
      .update(passwordResetTokens)
      .set({ usado_em: agora })
      .where(and(eq(passwordResetTokens.id, valido.id), isNull(passwordResetTokens.usado_em)))
      .returning({ id: passwordResetTokens.id });
    if (marcado.length === 0) return false;

    await tx.update(users).set({ senha_hash }).where(eq(users.id, valido.userId));

    // Invalida quaisquer outros tokens de reset ainda abertos do usuário:
    // depois de redefinir a senha, nenhum link antigo deve continuar válido.
    await tx
      .update(passwordResetTokens)
      .set({ usado_em: agora })
      .where(and(eq(passwordResetTokens.user_id, valido.userId), isNull(passwordResetTokens.usado_em)));

    return true;
  });
}
