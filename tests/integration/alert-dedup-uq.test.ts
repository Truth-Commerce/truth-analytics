import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { alerts, organizations } from '@/db/schema';
import type { AlertaCandidato } from '@/modules/alerts/alert-detectors';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-alerta-uq-';

const candidato: AlertaCandidato = {
  tipo: 'queda_vendas',
  severidade: 'atencao',
  titulo: 'Queda de vendas de 60% na última semana',
  corpo: 'Teste de dedup.',
  dados: { quedaPercentual: 60 },
  chaveDedup: 'queda_vendas',
};

describe.skipIf(!url)('dedup de alertas — índice único + cooldown', () => {
  let orgId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
  });

  afterAll(async () => {
    await db.delete(alerts).where(eq(alerts.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('criarAlertas com candidato duplicado ABERTO → ON CONFLICT DO NOTHING (retorna [])', async () => {
    const { criarAlertas } = await import('@/modules/alerts/alert.repository');
    const primeira = await criarAlertas(orgId, [candidato]);
    expect(primeira.length).toBe(1);

    const segunda = await criarAlertas(orgId, [candidato]);
    expect(segunda.length).toBe(0); // conflito engolido — nada inserido

    const abertos = await db.select({ id: alerts.id }).from(alerts).where(eq(alerts.org_id, orgId));
    expect(abertos.length).toBe(1);
  });

  it('listAlertasParaDedup inclui resolvido recente (cooldown) e exclui resolvido antigo', async () => {
    const { listAlertasParaDedup, resolverAlerta } = await import(
      '@/modules/alerts/alert.repository'
    );
    const agora = new Date();

    // Resolve o alerta aberto do teste anterior → entra no cooldown de 7 dias.
    const [aberto] = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(eq(alerts.org_id, orgId));
    await resolverAlerta(aberto!.id, orgId);

    let base = await listAlertasParaDedup(orgId, agora);
    expect(base.some((a) => a.tipo === 'queda_vendas' && a.chaveDedup === 'queda_vendas')).toBe(true);

    // Envelhece a resolução para 8 dias atrás → sai do cooldown.
    await db
      .update(alerts)
      .set({ resolvido_em: new Date(agora.getTime() - 8 * 86_400_000) })
      .where(eq(alerts.id, aberto!.id));
    base = await listAlertasParaDedup(orgId, agora);
    expect(base.some((a) => a.chaveDedup === 'queda_vendas')).toBe(false);
  });

  it('getUltimaDataPedido devolve null para org sem pedidos', async () => {
    const { getUltimaDataPedido } = await import('@/modules/alerts/alert-data.repository');
    expect(await getUltimaDataPedido(orgId)).toBeNull();
  });
});
