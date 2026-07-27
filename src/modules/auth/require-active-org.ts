import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getOrganizationById, type ClientOrganization } from '@/modules/admin/admin.repository';
import { IMPERSONATION_COOKIE, verificarImpersonation } from '@/modules/auth/impersonation';
import { requireSession } from '@/modules/auth/require-session';
import type { UserAccess } from '@/modules/auth/user.types';

// ---------------------------------------------------------------------------
// Impersonação ("ver como cliente" — Task 12 H4). Invariante cardinal: SÓ
// requireActiveOrg (leitura) enxerga o cookie; requireActiveOrgParaMutacao
// bloqueia qualquer escrita quando a sessão é sintética. `tasks.actions.ts`
// resolve contexto via requireSession direto (não passa por
// requireActiveOrg) — por isso expõe `assertNaoImpersonando`, abaixo, como um
// segundo guard independente para essa camada (fix pós-Task 12: dois
// breaches de escrita durante impersonação em tasks.actions.ts).
//
// lerImpersonacaoAtiva: dado o UserAccess REAL (de requireSession/
// getSessionContext), decide se há uma impersonação válida em curso.
// Retorna null sempre que o papel real não é admin_truth, o cookie está
// ausente/adulterado/vencido, a org alvo não existe, ou não está mais
// 'active' (revalidado aqui — não confia só no estado no instante em que o
// cookie foi assinado, já que a janela de 30min pode atravessar uma
// suspensão da org).
// ---------------------------------------------------------------------------
async function lerImpersonacaoAtiva(
  realAccess: UserAccess,
): Promise<{ org: ClientOrganization; adminId: string } | null> {
  if (realAccess.role !== 'admin_truth') return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!cookieValue) return null;

  const verificado = verificarImpersonation(cookieValue, new Date());
  if (!verificado) return null;

  const org = await getOrganizationById(verificado.orgId);
  if (!org || org.status !== 'active') return null;

  return { org, adminId: verificado.adminId };
}

export async function requireActiveOrg(): Promise<UserAccess> {
  const access = await requireSession();

  const impersonacao = await lerImpersonacaoAtiva(access);
  if (impersonacao) {
    return {
      id: impersonacao.adminId,
      orgId: impersonacao.org.id,
      role: 'client',
      orgStatus: 'active',
      plano: impersonacao.org.plano,
      impersonadoPor: impersonacao.adminId,
    };
  }

  if (access.orgStatus !== 'active') redirect('/aguardando');
  return access;
}

/**
 * Igual a requireActiveOrg, mas recusa qualquer chamada feita sob
 * impersonação — é o guard que toda action de MUTAÇÃO do cliente deve usar
 * (ver sweep da Task 12). "Ver como cliente" é read-only por construção:
 * nenhum caminho de escrita aceita um UserAccess sintético.
 */
export async function requireActiveOrgParaMutacao(): Promise<UserAccess> {
  const access = await requireActiveOrg();
  if (access.impersonadoPor) {
    throw new Error('Modo visualização: ações desabilitadas');
  }
  return access;
}

/**
 * Guard independente de sessão para camadas que NÃO passam por
 * requireActiveOrg — hoje só `tasks.actions.ts` (resolve contexto via
 * `requireSession` direto, então nunca vê o UserAccess sintético). Lê o
 * cookie de impersonação diretamente: uma assinatura HMAC válida SÓ pode ter
 * sido produzida por `iniciarImpersonationAction` (gated por `requireAdmin`),
 * então a mera presença de um cookie válido e não vencido já basta para saber
 * que a sessão está em modo "ver como cliente" — não precisa recarregar a
 * sessão real nem revalidar a org no banco (isso é próprio do caminho de
 * LEITURA em `lerImpersonacaoAtiva`, que decide o que a sessão sintética pode
 * ver; aqui só importa se ela existe, para barrar a escrita).
 *
 * Mesma mensagem de erro de `requireActiveOrgParaMutacao` — os dois guards
 * protegem a mesma invariante ("ver como cliente" é read-only por
 * construção), só por portas de entrada diferentes.
 */
export async function assertNaoImpersonando(): Promise<void> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!cookieValue) return;
  if (verificarImpersonation(cookieValue, new Date())) {
    throw new Error('Modo visualização: ações desabilitadas');
  }
}

/**
 * Usado pelo layout (client) para desenhar a faixa de impersonação — NUNCA
 * redireciona (o layout também não redireciona; cada página decide isso via
 * requireActiveOrg/requireActiveOrgParaMutacao). Recebe o UserAccess REAL já
 * carregado pelo layout (evita uma 2ª consulta de sessão) e devolve o nome
 * da org "vista como", ou null se não há impersonação válida em curso —
 * inclusive para o cliente real, cujo papel nunca é admin_truth.
 */
export async function getImpersonationBanner(
  realAccess: UserAccess | null,
): Promise<{ orgId: string; orgName: string } | null> {
  if (!realAccess) return null;
  const impersonacao = await lerImpersonacaoAtiva(realAccess);
  return impersonacao ? { orgId: impersonacao.org.id, orgName: impersonacao.org.name } : null;
}
