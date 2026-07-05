import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { alerts, organizations } from '@/db/schema';
import type { AlertaCandidato } from '@/modules/alerts/alert-detectors';
import {
  criarAlertas,
  listAlertasAbertos,
  resolverAlerta,
} from '@/modules/alerts/alert.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-alert-';

function candidato(over: Partial<AlertaCandidato> & { chaveDedup: string }): AlertaCandidato {
  return {
    tipo: 'concorrente_preco',
    severidade: 'atencao',
    titulo: 'Título padrão',
    corpo: 'Corpo padrão',
    dados: {},
    ...over,
  };
}

describe.skipIf(!url)('alert.repository — integração multi-tenant', () => {
  let orgAId = '';
  let orgBId = '';

  beforeAll(async () => {
    const [orgA] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-a-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAId = orgA!.id;

    const [orgB] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-b-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB!.id;
  });

  afterAll(async () => {
    try {
      await db.delete(alerts).where(eq(alerts.org_id, orgAId));
      await db.delete(alerts).where(eq(alerts.org_id, orgBId));
      await db.delete(organizations).where(eq(organizations.id, orgAId));
      await db.delete(organizations).where(eq(organizations.id, orgBId));
    } finally {
      // sem conexão dedicada aberta aqui — o client do app é compartilhado
    }
  });

  it('criarAlertas insere e listAlertasAbertos retorna com chaveDedup correto', async () => {
    const ids = await criarAlertas(orgAId, [
      candidato({ chaveDedup: 'queda_vendas', tipo: 'queda_vendas', titulo: 'Queda' }),
      candidato({ chaveDedup: 'concorrente_preco:A', titulo: 'Concorrente A' }),
    ]);
    expect(ids).toHaveLength(2);

    const abertos = await listAlertasAbertos(orgAId);
    expect(abertos).toHaveLength(2);
    const chaves = abertos.map((a) => a.chaveDedup).sort();
    expect(chaves).toEqual(['concorrente_preco:A', 'queda_vendas']);
  });

  it('criarAlertas com lista vazia retorna [] sem inserir', async () => {
    const ids = await criarAlertas(orgAId, []);
    expect(ids).toEqual([]);
    expect(await listAlertasAbertos(orgAId)).toHaveLength(2);
  });

  it('resolverAlerta(id, orgDona) → true e some da lista de abertos', async () => {
    const abertos = await listAlertasAbertos(orgAId);
    const alvo = abertos.find((a) => a.chaveDedup === 'queda_vendas')!;

    const ok = await resolverAlerta(alvo.id, orgAId);
    expect(ok).toBe(true);

    const depois = await listAlertasAbertos(orgAId);
    expect(depois.map((a) => a.chaveDedup)).not.toContain('queda_vendas');
    expect(depois).toHaveLength(1);
  });

  it('resolverAlerta com org alheia → false (isolamento multi-tenant)', async () => {
    const abertos = await listAlertasAbertos(orgAId);
    const alvo = abertos.find((a) => a.chaveDedup === 'concorrente_preco:A')!;

    const negado = await resolverAlerta(alvo.id, orgBId);
    expect(negado).toBe(false);

    // continua aberto para a org dona
    const aindaAberto = await listAlertasAbertos(orgAId);
    expect(aindaAberto.map((a) => a.chaveDedup)).toContain('concorrente_preco:A');
  });

  it('resolver 2x o mesmo alerta → segunda vez false (já resolvido)', async () => {
    const abertos = await listAlertasAbertos(orgAId);
    const alvo = abertos.find((a) => a.chaveDedup === 'concorrente_preco:A')!;

    expect(await resolverAlerta(alvo.id, orgAId)).toBe(true);
    expect(await resolverAlerta(alvo.id, orgAId)).toBe(false);
  });
});
