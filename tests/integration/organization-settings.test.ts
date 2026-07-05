import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!url)('organization-settings.repository — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);
  let orgId = '';

  beforeAll(async () => {
    const [o] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-settings-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = o.id;
  });

  afterAll(async () => {
    try {
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      await sql.end();
    }
  });

  it('retorna os defaults (geracaoAutomatica=true, metaMensal=null) para org recém-criada', async () => {
    const { getOrgSettings } = await import(
      '@/modules/organizations/organization-settings.repository'
    );
    expect(await getOrgSettings(orgId)).toEqual({ geracaoAutomatica: true, metaMensal: null });
  });

  it('setGeracaoAutomatica(orgId, false) → getOrgSettings reflete a mudança', async () => {
    const { getOrgSettings, setGeracaoAutomatica } = await import(
      '@/modules/organizations/organization-settings.repository'
    );
    await setGeracaoAutomatica(orgId, false);
    const settings = await getOrgSettings(orgId);
    expect(settings?.geracaoAutomatica).toBe(false);
  });

  it('retorna null para organização inexistente', async () => {
    const { getOrgSettings } = await import(
      '@/modules/organizations/organization-settings.repository'
    );
    expect(await getOrgSettings('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
