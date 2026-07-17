import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { kitSuggestions, organizations, reports } from '@/db/schema';
import { insertKits, listKitsUltimoCiclo, marcarKitStatus } from '@/modules/kits/kit.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-kits-';

const KIT = {
  nome: 'Kit Café Completo',
  itens: [
    { sku: 'CANECA', nome: 'Caneca' },
    { sku: 'FILTRO', nome: 'Filtro' },
  ],
  precoSugerido: 79.9,
  argumento: 'Comprados juntos.',
  canalRecomendado: 'Shopee',
};
const CANDIDATO = {
  skus: ['CANECA', 'FILTRO'] as [string, string],
  nomes: ['Caneca', 'Filtro'] as [string, string],
  pedidosJuntos: 7,
};

describe.skipIf(!url)('kit.repository — integração', () => {
  let orgId = '';
  let outraOrgId = '';
  let reportId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [org2] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}outra-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    outraOrgId = org2!.id;
    const [rep] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'done',
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
      })
      .returning({ id: reports.id });
    reportId = rep!.id;
  });

  afterAll(async () => {
    for (const id of [orgId, outraOrgId]) {
      await db.delete(kitSuggestions).where(eq(kitSuggestions.org_id, id));
      await db.delete(reports).where(eq(reports.org_id, id));
      await db.delete(organizations).where(eq(organizations.id, id));
    }
  });

  it('insertKits grava payload com evidência casada e listKitsUltimoCiclo devolve por org', async () => {
    const n = await insertKits(orgId, reportId, [KIT], [CANDIDATO]);
    expect(n).toBe(1);

    const kits = await listKitsUltimoCiclo(orgId);
    expect(kits).toHaveLength(1);
    expect(kits[0]!.titulo).toBe('Kit Café Completo');
    expect((kits[0]!.payload as { evidencia: { pedidosJuntos: number } }).evidencia.pedidosJuntos).toBe(7);

    const outros = await listKitsUltimoCiclo(outraOrgId);
    expect(outros).toEqual([]);
  });

  it('marcarKitStatus é idempotente e escopado por org', async () => {
    const [kit] = await listKitsUltimoCiclo(orgId);
    // Outra org não consegue mexer:
    expect(await marcarKitStatus(outraOrgId, kit!.id, 'descartado')).toBe(false);
    // 1ª marcação funciona; 2ª (status já não é 'sugerido') retorna false:
    expect(await marcarKitStatus(orgId, kit!.id, 'descartado')).toBe(true);
    expect(await marcarKitStatus(orgId, kit!.id, 'virou_task')).toBe(false);
  });
});
