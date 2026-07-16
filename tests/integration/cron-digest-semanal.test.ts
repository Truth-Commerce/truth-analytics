import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// vi.mock é hoisted para o topo — usar literais diretamente (o mesmo valor é
// repetido em CRON_SECRET_TEST abaixo para uso no resto do teste).
vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, CRON_SECRET: 'cron-digest-teste-16+++++' },
  };
});

const CRON_SECRET_TEST = 'cron-digest-teste-16+++++';

import { db } from '@/db/client';
import { orders, organizations, taskActivities, tasks, users } from '@/db/schema';
import { hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';
import * as emailModule from '@/modules/notifications/email';
import * as digestModule from '@/modules/tasks/digest-semanal';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-digest-';
const DIA = 86_400_000;

function req(auth?: string): Request {
  return new Request('http://localhost:3000/api/cron/digest-semanal', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe.skipIf(!url)('cron digest-semanal — integração', () => {
  let orgId = '';
  let taskConcluidaId = '';
  const userEmail = `${PREFIX}${RUN}@example.com`;
  const agora = new Date();

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    await db
      .insert(users)
      .values({ org_id: orgId, email: userEmail, senha_hash: 'hash', role: 'client' });

    // 1 em andamento + 1 atrasada (todo com prazo no passado).
    await db.insert(tasks).values([
      { org_id: orgId, titulo: `${PREFIX}andamento`, status: 'em_andamento', criado_por: 'analista' },
      { org_id: orgId, titulo: `${PREFIX}atrasada`, status: 'todo', criado_por: 'analista', prazo: '2020-01-01' },
    ]);

    // 3ª task concluída com activity status→concluida (created_at = agora → dentro dos 7d).
    const [concluida] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}concluida`, status: 'concluida', criado_por: 'analista' })
      .returning({ id: tasks.id });
    taskConcluidaId = concluida!.id;
    await db.insert(taskActivities).values({
      task_id: taskConcluidaId,
      user_id: null,
      evento: 'status',
      de: 'em_revisao',
      para: 'concluida',
    });

    // Vendas: mês corrente (calendário BRT) R$ 150,50; mês anterior R$ 100 + R$ 100.
    const hoje = hojeBrt(agora);
    const inicioMesAtual = inicioDeDiaUtc(`${hoje.slice(0, 7)}-01`);
    const ultimoDiaMesAnterior = new Date(inicioMesAtual.getTime() - DIA);
    const inicioMesAnterior = new Date(
      Date.UTC(inicioMesAtual.getUTCFullYear(), inicioMesAtual.getUTCMonth() - 1, 1),
    );
    const venda = (sufixo: string, data: Date, valor: number) => ({
      org_id: orgId,
      bling_order_id: `${PREFIX}${RUN}-${sufixo}`,
      canal: 'bling',
      data,
      valor_total: valor.toFixed(2),
      itens: [],
    });
    await db.insert(orders).values([
      venda('atual', inicioMesAtual, 150.5),
      venda('ant-fim', ultimoDiaMesAnterior, 100),
      venda('ant-inicio', inicioMesAnterior, 100),
    ]);
  });

  afterAll(async () => {
    try {
      await db.delete(taskActivities).where(eq(taskActivities.task_id, taskConcluidaId));
      await db.delete(tasks).where(eq(tasks.org_id, orgId));
      await db.delete(orders).where(eq(orders.org_id, orgId));
      await db.delete(users).where(eq(users.org_id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('401 sem Bearer válido', async () => {
    const { GET } = await import('@/app/api/cron/digest-semanal/route');
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer errado'))).status).toBe(401);
  });

  it('rota autenticada → 200 { orgs, enviados } (varredura global mockada — lição da T7: o teste não varre orgs de outras suítes; a varredura real é coberta por unit com mock)', async () => {
    const scanSpy = vi
      .spyOn(digestModule, 'processarDigestSemanal')
      .mockResolvedValue({ orgs: 2, enviados: 1 });
    try {
      const { GET } = await import('@/app/api/cron/digest-semanal/route');
      const res = await GET(req(`Bearer ${CRON_SECRET_TEST}`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ orgs: 2, enviados: 1 });
      expect(scanSpy).toHaveBeenCalledTimes(1);
    } finally {
      scanSpy.mockRestore();
    }
  });

  it('processa (escopo = a própria org): 1 e-mail com contagens certas no resumo e vendas dos 2 meses', async () => {
    const spy = vi.spyOn(emailModule, 'sendDigestSemanalEmail').mockResolvedValue();
    try {
      const res = await digestModule.processarDigestSemanal(agora, { orgId });
      expect(res).toEqual({ orgs: 1, enviados: 1 });
      const chamadaDaOrg = spy.mock.calls.find(([to]) => to === userEmail);
      expect(chamadaDaOrg).toBeDefined();
      expect(chamadaDaOrg![1].resumo).toBe('1 concluída ✅, 1 atrasadas ⚠️, 1 em andamento');
      expect(chamadaDaOrg![1].orgName).toBe(`${PREFIX}org-${RUN}`);
      expect(chamadaDaOrg![1].vendasMes).toBe(150.5);
      expect(chamadaDaOrg![1].vendasMesAnterior).toBe(200);
    } finally {
      spy.mockRestore();
    }
  });

  it('org sem NENHUMA task → digest null, nenhum e-mail', async () => {
    const [orgVazia] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-vazia-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const orgVaziaId = orgVazia!.id;
    const spy = vi.spyOn(emailModule, 'sendDigestSemanalEmail').mockResolvedValue();
    try {
      const res = await digestModule.processarDigestSemanal(agora, { orgId: orgVaziaId });
      expect(res).toEqual({ orgs: 1, enviados: 0 });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      await db.delete(organizations).where(eq(organizations.id, orgVaziaId));
    }
  });
});
