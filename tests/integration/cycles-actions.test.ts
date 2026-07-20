import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Mesmo padrão de tests/integration/tasks-actions-crm.test.ts e
// impersonation-flow.test.ts: require-active-org.ts (via requireActiveOrg)
// resolve sessão chamando requireSession() direto (não `auth()` do NextAuth,
// que não funciona no ambiente node do vitest) e lê cookies() de
// next/headers (indisponível fora de um request real do Next) pro guard de
// impersonação.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const sessaoMock = { access: null as unknown };
vi.mock('@/modules/auth/require-session', () => ({
  requireSession: async () => sessaoMock.access,
}));

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

import { db } from '@/db/client';
import { cycles, organizations, tasks } from '@/db/schema';
import { ativarCicloAction, criarCicloAction, fecharCicloAction } from '@/actions/cycles.actions';
import { moverTaskParaCicloAction } from '@/actions/tasks.actions';
import { assinarImpersonation, IMPERSONATION_COOKIE } from '@/modules/auth/impersonation';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-ciclos-act-';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe.skipIf(!url)('H5/T9 — actions de ciclos (integração)', () => {
  let orgId = '';
  let orgOutroId = '';
  const clienteId = 'cliente-fake-1'; // sessaoMock não passa por FK de users — só o repo grava org_id real

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [orgOutro] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}outro-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgOutroId = orgOutro!.id;
  });

  afterAll(async () => {
    const orgIds = [orgId, orgOutroId];
    await db.delete(tasks).where(inArray(tasks.org_id, orgIds));
    await db.delete(cycles).where(inArray(cycles.org_id, orgIds));
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  });

  afterEach(() => {
    cookieStore.clear();
  });

  const adminId = 'admin-fake-1';

  function acessoCliente(org: string) {
    sessaoMock.access = { id: clienteId, orgId: org, role: 'client', orgStatus: 'active', plano: 'monthly' };
  }

  /**
   * Simula impersonação de verdade: `lerImpersonacaoAtiva` (require-active-org.ts)
   * só produz um UserAccess sintético quando o papel REAL da sessão é
   * 'admin_truth' (ver require-active-org.ts:29 e o teste dedicado em
   * impersonation-flow.test.ts "sessão REAL não-admin... cookie IGNORADO") —
   * plantar o cookie numa sessão de cliente NÃO ativa impersonação (é assim
   * que resolveTaskContext.assertNaoImpersonando difere: ele só olha a
   * assinatura do cookie, não o papel da sessão). Por isso o guard de
   * requireActiveOrgParaMutacao (usado pelas actions org-scoped deste
   * arquivo) precisa ser simulado com uma sessão REAL admin_truth + cookie
   * assinado visando a org alvo.
   */
  function acessoAdminImpersonando(orgAlvo: string) {
    sessaoMock.access = { id: adminId, orgId: 'org-interna-fake', role: 'admin_truth', orgStatus: 'active', plano: null };
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgAlvo, adminId, new Date()));
  }

  // -------------------------------------------------------------------
  // criarCicloAction
  // -------------------------------------------------------------------
  describe('criarCicloAction', () => {
    it('cliente cria ciclo (planejado) na própria org', async () => {
      acessoCliente(orgId);

      const res = await criarCicloAction({}, form({ nome: 'Sprint 1', inicio: '2026-08-01', fim: '2026-08-14' }));
      expect(res.ok).toBe(true);
      expect(res.cycleId).toBeTruthy();

      const [row] = await db.select().from(cycles).where(eq(cycles.id, res.cycleId!));
      expect(row?.org_id).toBe(orgId);
      expect(row?.status).toBe('planejado');
      expect(row?.inicio).toBe('2026-08-01');
    });

    it('nome curto demais é rejeitado (dados inválidos)', async () => {
      acessoCliente(orgId);
      const res = await criarCicloAction({}, form({ nome: 'ab' }));
      expect(res.error).toBeTruthy();
      expect(res.ok).toBeUndefined();
    });

    it('fim antes do início é rejeitado (período inválido)', async () => {
      acessoCliente(orgId);
      const res = await criarCicloAction({}, form({ nome: 'Sprint período', inicio: '2026-08-10', fim: '2026-08-01' }));
      expect(res.error).toBeTruthy();
    });

    it('impersonação bloqueia criarCicloAction (lança) — nenhum ciclo criado', async () => {
      acessoAdminImpersonando(orgId);

      await expect(criarCicloAction({}, form({ nome: 'Sprint impersonada' }))).rejects.toThrow(
        'Modo visualização: ações desabilitadas',
      );

      const depois = await db.select().from(cycles).where(eq(cycles.org_id, orgId));
      expect(depois.some((c) => c.nome === 'Sprint impersonada')).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // ativarCicloAction
  // -------------------------------------------------------------------
  describe('ativarCicloAction', () => {
    it('cliente ativa um ciclo planejado da própria org', async () => {
      acessoCliente(orgId);
      const criado = await criarCicloAction({}, form({ nome: 'Sprint ativar' }));

      const res = await ativarCicloAction(form({ cycleId: criado.cycleId! }));
      expect(res.ok).toBe(true);

      const [row] = await db.select().from(cycles).where(eq(cycles.id, criado.cycleId!));
      expect(row?.status).toBe('ativo');
    });

    it('ciclo de outra org é rejeitado (erro, não ativa o de outrem)', async () => {
      acessoCliente(orgOutroId);
      const criadoNaOutraOrg = await criarCicloAction({}, form({ nome: 'Sprint da org B' }));

      acessoCliente(orgId); // sessão agora é da org A, tentando ativar ciclo da org B
      const res = await ativarCicloAction(form({ cycleId: criadoNaOutraOrg.cycleId! }));
      expect(res.error).toBeTruthy();

      const [row] = await db.select().from(cycles).where(eq(cycles.id, criadoNaOutraOrg.cycleId!));
      expect(row?.status).toBe('planejado'); // intacto
    });

    it('impersonação bloqueia ativarCicloAction (lança) — ciclo continua planejado', async () => {
      acessoCliente(orgId);
      const criado = await criarCicloAction({}, form({ nome: 'Sprint ativar impersonada' }));

      acessoAdminImpersonando(orgId);
      await expect(ativarCicloAction(form({ cycleId: criado.cycleId! }))).rejects.toThrow(
        'Modo visualização: ações desabilitadas',
      );

      const [row] = await db.select().from(cycles).where(eq(cycles.id, criado.cycleId!));
      expect(row?.status).toBe('planejado');
    });
  });

  // -------------------------------------------------------------------
  // fecharCicloAction
  // -------------------------------------------------------------------
  describe('fecharCicloAction', () => {
    it('cliente fecha um ciclo da própria org', async () => {
      acessoCliente(orgId);
      const criado = await criarCicloAction({}, form({ nome: 'Sprint fechar' }));

      const res = await fecharCicloAction(form({ cycleId: criado.cycleId! }));
      expect(res.ok).toBe(true);

      const [row] = await db.select().from(cycles).where(eq(cycles.id, criado.cycleId!));
      expect(row?.status).toBe('fechado');
    });

    it('impersonação bloqueia fecharCicloAction (lança) — ciclo continua planejado', async () => {
      acessoCliente(orgId);
      const criado = await criarCicloAction({}, form({ nome: 'Sprint fechar impersonada' }));

      acessoAdminImpersonando(orgId);
      await expect(fecharCicloAction(form({ cycleId: criado.cycleId! }))).rejects.toThrow(
        'Modo visualização: ações desabilitadas',
      );

      const [row] = await db.select().from(cycles).where(eq(cycles.id, criado.cycleId!));
      expect(row?.status).toBe('planejado');
    });
  });

  // -------------------------------------------------------------------
  // moverTaskParaCicloAction (tasks.actions.ts — task-scoped, resolveTaskContext)
  // -------------------------------------------------------------------
  describe('moverTaskParaCicloAction', () => {
    it('cliente move a própria task para dentro e depois pra fora do ciclo', async () => {
      acessoCliente(orgId);
      const criado = await criarCicloAction({}, form({ nome: 'Sprint mover task' }));
      const [task] = await db
        .insert(tasks)
        .values({ org_id: orgId, titulo: 'Task mover ciclo', tipo: 'outro', prioridade: 'media', status: 'todo', criado_por: 'cliente', ordem: 1 })
        .returning({ id: tasks.id });
      const taskId = task!.id;

      const r1 = await moverTaskParaCicloAction(form({ taskId, cycleId: criado.cycleId! }));
      expect(r1.ok).toBe(true);
      let [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(row?.cycle_id).toBe(criado.cycleId);

      const r2 = await moverTaskParaCicloAction(form({ taskId }));
      expect(r2.ok).toBe(true);
      [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(row?.cycle_id).toBeNull();
    });

    it('impersonação bloqueia moverTaskParaCicloAction (lança) — task não muda de ciclo', async () => {
      acessoCliente(orgId);
      const criado = await criarCicloAction({}, form({ nome: 'Sprint mover impersonada' }));
      const [task] = await db
        .insert(tasks)
        .values({ org_id: orgId, titulo: 'Task mover impersonada', tipo: 'outro', prioridade: 'media', status: 'todo', criado_por: 'cliente', ordem: 2 })
        .returning({ id: tasks.id });
      const taskId = task!.id;

      // assertNaoImpersonando (1ª linha de resolveTaskContext) só olha a
      // assinatura do cookie — mas simulamos com a sessão admin de verdade
      // por consistência com o resto da suíte (tasks-actions-crm.test.ts).
      acessoAdminImpersonando(orgId);
      await expect(moverTaskParaCicloAction(form({ taskId, cycleId: criado.cycleId! }))).rejects.toThrow(
        'Modo visualização: ações desabilitadas',
      );

      const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(row?.cycle_id).toBeNull();
    });
  });
});
