import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations } from '@/db/schema';
import { getOrganizationById, updateOrgNicho } from '@/modules/admin/admin.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const PREFIX = 'ta-test-nicho-';
const RUN = Date.now();

describe.skipIf(!url)('admin.repository — updateOrgNicho (integração)', () => {
  let orgId = '';
  let outraOrgId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}a-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [outra] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}b-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    outraOrgId = outra.id;
  });

  afterAll(async () => {
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, outraOrgId));
    await sql.end();
  });

  it('grava o nicho com trim', async () => {
    const retorno = await updateOrgNicho(orgId, '  Moda feminina  ');
    expect(retorno).toBe('Moda feminina');
    const org = await getOrganizationById(orgId);
    expect(org?.nicho).toBe('Moda feminina');
  });

  it('string vazia (ou só espaços) vira null', async () => {
    await updateOrgNicho(orgId, 'Moda feminina');
    const retorno = await updateOrgNicho(orgId, '   ');
    expect(retorno).toBeNull();
    const org = await getOrganizationById(orgId);
    expect(org?.nicho).toBeNull();
  });

  it('null explícito grava null', async () => {
    await updateOrgNicho(orgId, 'Moda feminina');
    const retorno = await updateOrgNicho(orgId, null);
    expect(retorno).toBeNull();
    const org = await getOrganizationById(orgId);
    expect(org?.nicho).toBeNull();
  });

  it('trunca para 60 caracteres após o trim', async () => {
    const longo = '  ' + 'a'.repeat(70) + '  ';
    const retorno = await updateOrgNicho(orgId, longo);
    expect(retorno).toBe('a'.repeat(60));
    expect(retorno?.length).toBeLessThanOrEqual(60);
    const org = await getOrganizationById(orgId);
    expect(org?.nicho).toBe('a'.repeat(60));
    expect(org?.nicho?.length).toBe(60);
  });

  it('é escopado por org — não afeta outras organizações', async () => {
    await updateOrgNicho(orgId, 'Papelaria');
    await updateOrgNicho(outraOrgId, null);
    const [org, outra] = await Promise.all([
      getOrganizationById(orgId),
      getOrganizationById(outraOrgId),
    ]);
    expect(org?.nicho).toBe('Papelaria');
    expect(outra?.nicho).toBeNull();
  });
});
