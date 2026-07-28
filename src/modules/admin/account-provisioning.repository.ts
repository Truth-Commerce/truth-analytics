import { db } from '@/db/client';
import { hasPostgresErrorCode } from '@/db/postgres-error';
import { auditLog, organizations, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';
import { normalizeEmail } from '@/modules/auth/user.repository';

type ProvisionBase = {
  email: string;
  senha: string;
  actorUserId: string;
};

/**
 * Cria a organização cliente, seu primeiro acesso e o registro de auditoria
 * na mesma transação. Uma colisão global de e-mail reverte também a
 * organização, impedindo cadastros órfãos.
 */
export async function provisionClientAccount(
  input: ProvisionBase & { orgName: string },
): Promise<{ orgId: string; userId: string }> {
  const email = normalizeEmail(input.email);
  const senhaHash = await hashPassword(input.senha);

  try {
    return await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: input.orgName.trim(), status: 'pending' })
        .returning({ id: organizations.id });

      const [user] = await tx
        .insert(users)
        .values({
          org_id: org.id,
          email,
          senha_hash: senhaHash,
          role: 'client',
          aceitou_termos_em: null,
        })
        .returning({ id: users.id });

      await tx.insert(auditLog).values({
        org_id: org.id,
        user_id: input.actorUserId,
        acao: 'org.criada_admin',
        detalhes: { novoUserId: user.id, email, role: 'client' },
      });

      return { orgId: org.id, userId: user.id };
    });
  } catch (error) {
    if (hasPostgresErrorCode(error, '23505')) throw new Error('email_em_uso');
    throw error;
  }
}

/** Cria um analista na organização interna do admin e audita atomicamente. */
export async function provisionAnalystAccount(
  input: ProvisionBase & { internalOrgId: string },
): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);
  const senhaHash = await hashPassword(input.senha);

  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          org_id: input.internalOrgId,
          email,
          senha_hash: senhaHash,
          role: 'analista',
          aceitou_termos_em: null,
        })
        .returning({ id: users.id });

      await tx.insert(auditLog).values({
        org_id: input.internalOrgId,
        user_id: input.actorUserId,
        acao: 'user.criado_admin',
        detalhes: { novoUserId: user.id, email, role: 'analista' },
      });

      return { userId: user.id };
    });
  } catch (error) {
    if (hasPostgresErrorCode(error, '23505')) throw new Error('email_em_uso');
    throw error;
  }
}
