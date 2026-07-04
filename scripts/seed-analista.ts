import { fileURLToPath } from 'node:url';

import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { users } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import { hashPassword } from '@/modules/auth/password';
import { normalizeEmail } from '@/modules/auth/user.repository';

export async function seedAnalista(input: {
  email: string;
  senha: string;
}): Promise<{ userId: string; orgId: string; promoted: boolean }> {
  const email = normalizeEmail(input.email);

  const [internalAdmin] = await db
    .select({ org_id: users.org_id })
    .from(users)
    .where(eq(users.role, 'admin_truth'))
    .orderBy(asc(users.created_at))
    .limit(1);

  if (!internalAdmin) {
    throw new Error(
      'Nenhum admin_truth encontrado — rode db:seed-admin antes de criar o analista.',
    );
  }
  const orgId = internalAdmin.org_id;

  const [existing] = await db
    .select({ id: users.id, org_id: users.org_id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    await db.update(users).set({ role: 'analista' }).where(eq(users.id, existing.id));
    await recordAudit({
      orgId: existing.org_id,
      userId: existing.id,
      acao: 'analista.seed',
      detalhes: { promoted: true },
    });
    return { userId: existing.id, orgId: existing.org_id, promoted: true };
  }

  const senha_hash = await hashPassword(input.senha);
  const [user] = await db
    .insert(users)
    .values({ org_id: orgId, email, senha_hash, role: 'analista' })
    .returning({ id: users.id });

  await recordAudit({
    orgId,
    userId: user.id,
    acao: 'analista.seed',
    detalhes: { promoted: false },
  });
  return { userId: user.id, orgId, promoted: false };
}

// CLI entrypoint: lê credenciais do ambiente (nunca hardcodar).
async function main() {
  const email = process.env.ANALISTA_EMAIL;
  const senha = process.env.ANALISTA_SENHA;
  if (!email || !senha) {
    console.error('Defina ANALISTA_EMAIL e ANALISTA_SENHA no ambiente.');
    process.exit(1);
  }
  const result = await seedAnalista({ email, senha });
  console.log(
    result.promoted
      ? `Usuário ${email} promovido a analista.`
      : `Analista ${email} criado (org ${result.orgId}).`,
  );
  process.exit(0);
}

// Executa main() apenas quando rodado como script (não em import de teste).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
