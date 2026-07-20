import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// require-active-org.ts depende de requireSession (→ getSessionContext →
// auth() do NextAuth), que não funciona no ambiente node do vitest (mesmo
// problema documentado em tests/integration/tasks-actions.test.ts). Por isso
// mockamos requireSession diretamente — é a fronteira certa: tudo O QUE
// IMPORTA para este teste (leitura/verificação do cookie de impersonação +
// a consulta REAL da org alvo no banco, via admin.repository) fica fora do
// mock.
// ---------------------------------------------------------------------------
vi.mock('@/modules/auth/require-session', () => ({ requireSession: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
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
import { organizations } from '@/db/schema';
import { assinarImpersonation, IMPERSONATION_COOKIE } from '@/modules/auth/impersonation';
import { requireSession } from '@/modules/auth/require-session';
import {
  getImpersonationBanner,
  requireActiveOrg,
  requireActiveOrgParaMutacao,
} from '@/modules/auth/require-active-org';
import type { UserAccess } from '@/modules/auth/user.types';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-imperson-';

const ADMIN: UserAccess = {
  id: 'admin-real-1',
  orgId: 'org-interna-fake',
  role: 'admin_truth',
  orgStatus: 'active',
  plano: null,
};

const CLIENTE_REAL: UserAccess = {
  id: 'user-cliente-real',
  orgId: 'org-cliente-real-fake',
  role: 'client',
  orgStatus: 'active',
  plano: 'monthly',
};

describe.skipIf(!url)('impersonação — fluxo integrado (require-active-org + cookie HMAC)', () => {
  let orgAlvoId = '';
  let orgSuspensaId = '';

  beforeAll(async () => {
    const [alvo] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}alvo-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    orgAlvoId = alvo!.id;

    const [suspensa] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}suspensa-${RUN}`, status: 'suspended', plano: 'monthly' })
      .returning({ id: organizations.id });
    orgSuspensaId = suspensa!.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgAlvoId));
    await db.delete(organizations).where(eq(organizations.id, orgSuspensaId));
  });

  afterEach(() => {
    cookieStore.clear();
    vi.mocked(requireSession).mockReset();
  });

  it('cookie válido + admin_truth real → acesso sintético de LEITURA como o cliente alvo', async () => {
    vi.mocked(requireSession).mockResolvedValue(ADMIN);
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgAlvoId, ADMIN.id, new Date()));

    const access = await requireActiveOrg();
    expect(access).toEqual({
      id: ADMIN.id,
      orgId: orgAlvoId,
      role: 'client',
      orgStatus: 'active',
      plano: 'weekly',
      impersonadoPor: ADMIN.id,
    });
  });

  it('MUTAÇÃO sob impersonação → requireActiveOrgParaMutacao rejeita (read-only por construção)', async () => {
    vi.mocked(requireSession).mockResolvedValue(ADMIN);
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgAlvoId, ADMIN.id, new Date()));

    await expect(requireActiveOrgParaMutacao()).rejects.toThrow('Modo visualização: ações desabilitadas');
  });

  it('admin SEM impersonação (nenhum cookie) → requireActiveOrgParaMutacao funciona normalmente', async () => {
    vi.mocked(requireSession).mockResolvedValue(ADMIN);
    const access = await requireActiveOrgParaMutacao();
    expect(access).toEqual(ADMIN);
    expect(access.impersonadoPor).toBeUndefined();
  });

  it('cookie ADULTERADO (assinatura quebrada) → ignorado, acesso normal do admin', async () => {
    vi.mocked(requireSession).mockResolvedValue(ADMIN);
    const valorValido = assinarImpersonation(orgAlvoId, ADMIN.id, new Date());
    cookieStore.set(IMPERSONATION_COOKIE, `${valorValido}adulterado`);

    const access = await requireActiveOrg();
    expect(access).toEqual(ADMIN);
    expect(access).not.toHaveProperty('impersonadoPor');
  });

  it('cookie VENCIDO → ignorado, acesso normal do admin', async () => {
    vi.mocked(requireSession).mockResolvedValue(ADMIN);
    const passado = new Date(Date.now() - 60 * 60 * 1000); // 1h atrás → já expirado (TTL 30min)
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgAlvoId, ADMIN.id, passado));

    const access = await requireActiveOrg();
    expect(access).toEqual(ADMIN);
  });

  it('org alvo SUSPENSA → cookie assinado corretamente mas ignorado (revalida status no momento do acesso)', async () => {
    vi.mocked(requireSession).mockResolvedValue(ADMIN);
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgSuspensaId, ADMIN.id, new Date()));

    const access = await requireActiveOrg();
    expect(access).toEqual(ADMIN);
  });

  it('org alvo INEXISTENTE → ignorado, acesso normal do admin', async () => {
    vi.mocked(requireSession).mockResolvedValue(ADMIN);
    cookieStore.set(
      IMPERSONATION_COOKIE,
      assinarImpersonation('00000000-0000-0000-0000-000000000000', ADMIN.id, new Date()),
    );

    const access = await requireActiveOrg();
    expect(access).toEqual(ADMIN);
  });

  it('sessão REAL não-admin (cliente) com cookie plantado → cookie IGNORADO, acesso normal do cliente', async () => {
    // Simula um cliente mal-intencionado que copiou/forjou o cookie de outro
    // contexto: como o papel REAL não é admin_truth, lerImpersonacaoAtiva
    // nem chega a olhar o cookie.
    vi.mocked(requireSession).mockResolvedValue(CLIENTE_REAL);
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgAlvoId, ADMIN.id, new Date()));

    const access = await requireActiveOrg();
    expect(access).toEqual(CLIENTE_REAL);
  });

  it('sem cookie algum → comportamento atual intacto (devolve o access real do admin)', async () => {
    vi.mocked(requireSession).mockResolvedValue(ADMIN);
    const access = await requireActiveOrg();
    expect(access).toEqual(ADMIN);
  });

  it('sem cookie + cliente com org pendente → continua redirecionando pra /aguardando (não regrediu)', async () => {
    vi.mocked(requireSession).mockResolvedValue({ ...CLIENTE_REAL, orgStatus: 'pending' });
    await expect(requireActiveOrg()).rejects.toThrow('REDIRECT:/aguardando');
  });

  it('getImpersonationBanner: admin impersonando → nome da org alvo (pro banner do layout)', async () => {
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgAlvoId, ADMIN.id, new Date()));
    const banner = await getImpersonationBanner(ADMIN);
    expect(banner).toEqual({ orgId: orgAlvoId, orgName: `${PREFIX}alvo-${RUN}` });
  });

  it('getImpersonationBanner: cliente real → null (NUNCA vê o banner, mesmo com cookie plantado)', async () => {
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgAlvoId, ADMIN.id, new Date()));
    const banner = await getImpersonationBanner(CLIENTE_REAL);
    expect(banner).toBeNull();
  });

  it('getImpersonationBanner: admin sem cookie → null', async () => {
    const banner = await getImpersonationBanner(ADMIN);
    expect(banner).toBeNull();
  });

  it('getImpersonationBanner: access null (sem sessão) → null', async () => {
    const banner = await getImpersonationBanner(null);
    expect(banner).toBeNull();
  });
});
