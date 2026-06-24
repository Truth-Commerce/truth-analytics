import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, users } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import { hashPassword } from '@/modules/auth/password';
import { normalizeEmail } from '@/modules/auth/user.repository';

export async function seedAdmin(input: {
  email: string;
  senha: string;
  orgName?: string;
}): Promise<{ userId: string; orgId: string; promoted: boolean }> {
  const email = normalizeEmail(input.email);

  const [existing] = await db
    .select({ id: users.id, org_id: users.org_id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ role: 'admin_truth' })
      .where(eq(users.id, existing.id));
    await recordAudit({
      orgId: existing.org_id,
      userId: existing.id,
      acao: 'admin.seed',
      detalhes: { promoted: true },
    });
    return { userId: existing.id, orgId: existing.org_id, promoted: true };
  }

  const senha_hash = await hashPassword(input.senha);
  const created = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: input.orgName ?? 'Truth Commerce (interno)', status: 'active' })
      .returning({ id: organizations.id });
    const [user] = await tx
      .insert(users)
      .values({ org_id: org.id, email, senha_hash, role: 'admin_truth' })
      .returning({ id: users.id });
    return { orgId: org.id, userId: user.id };
  });
  await recordAudit({
    orgId: created.orgId,
    userId: created.userId,
    acao: 'admin.seed',
    detalhes: { promoted: false },
  });
  return { ...created, promoted: false };
}

// CLI entrypoint: lê credenciais do ambiente (nunca hardcodar).
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const senha = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !senha) {
    console.error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no ambiente.');
    process.exit(1);
  }
  const result = await seedAdmin({ email, senha });
  console.log(
    result.promoted
      ? `Usuário ${email} promovido a admin_truth.`
      : `Admin ${email} criado (org ${result.orgId}).`,
  );
  process.exit(0);
}

// Executa main() apenas quando rodado como script (não em import de teste).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
