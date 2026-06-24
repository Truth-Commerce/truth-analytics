import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { auditLog, organizations, users } from '@/db/schema';
import { seedAdmin } from '../../scripts/seed-admin';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const RUN = Date.now();
const email = `seed-${RUN}@ta-test-admin.example.com`;

describe.skipIf(!url)('seedAdmin — idempotência', () => {
  let orgId = '';

  afterAll(async () => {
    if (orgId) {
      await tdb.delete(auditLog).where(eq(auditLog.org_id, orgId));
      await tdb.delete(users).where(eq(users.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    }
    await sql.end();
  });

  it('cria admin_truth + org interna na primeira vez', async () => {
    const r = await seedAdmin({ email, senha: 'senha-admin-123', orgName: `ta-test-admin-${RUN}` });
    orgId = r.orgId;
    expect(r.promoted).toBe(false);
    const [u] = await tdb.select().from(users).where(eq(users.id, r.userId)).limit(1);
    expect(u.role).toBe('admin_truth');
    const [o] = await tdb.select().from(organizations).where(eq(organizations.id, r.orgId)).limit(1);
    expect(o.status).toBe('active');
  });

  it('segunda chamada com mesmo e-mail promove (não duplica)', async () => {
    const r = await seedAdmin({ email, senha: 'irrelevante', orgName: 'ignored' });
    expect(r.promoted).toBe(true);
    const all = await tdb.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(all.length).toBe(1);
  });
});
