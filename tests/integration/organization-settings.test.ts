import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { orders, organizations } from '@/db/schema';
import { hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';

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
      await tdb.delete(orders).where(eq(orders.org_id, orgId));
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

  it('setMetaMensal(orgId, 15000) → getOrgSettings reflete metaMensal:15000; setMetaMensal(orgId, null) → volta a null', async () => {
    const { getOrgSettings, setMetaMensal } = await import(
      '@/modules/organizations/organization-settings.repository'
    );
    await setMetaMensal(orgId, 15000);
    expect((await getOrgSettings(orgId))?.metaMensal).toBe(15000);

    await setMetaMensal(orgId, null);
    expect((await getOrgSettings(orgId))?.metaMensal).toBeNull();
  });

  it('getTotalVendasMesCorrente soma apenas as orders do mês corrente', async () => {
    const { getTotalVendasMesCorrente } = await import(
      '@/modules/organizations/organization-settings.repository'
    );
    const agora = new Date();
    const inicioMesCorrente = inicioDeDiaUtc(`${hojeBrt(agora).slice(0, 7)}-01`);
    const mesAnterior = new Date(inicioMesCorrente.getTime() - 15 * 86_400_000);

    await tdb.insert(orders).values([
      {
        org_id: orgId,
        bling_order_id: `meta-test-1-${RUN}`,
        canal: 'teste',
        data: inicioMesCorrente,
        valor_total: '100.50',
      },
      {
        org_id: orgId,
        bling_order_id: `meta-test-2-${RUN}`,
        canal: 'teste',
        data: inicioMesCorrente,
        valor_total: '200',
      },
      {
        org_id: orgId,
        bling_order_id: `meta-test-3-${RUN}`,
        canal: 'teste',
        data: mesAnterior,
        valor_total: '999',
      },
    ]);

    expect(await getTotalVendasMesCorrente(orgId, agora)).toBe(300.5);
  });
});
