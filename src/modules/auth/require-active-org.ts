import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getOrganizationById, type ClientOrganization } from '@/modules/admin/admin.repository';
import { IMPERSONATION_COOKIE, verificarImpersonation } from '@/modules/auth/impersonation';
import { requireSession } from '@/modules/auth/require-session';
import type { UserAccess } from '@/modules/auth/user.types';

// ---------------------------------------------------------------------------
// Impersonação ("ver como cliente" — Task 12 H4). Invariante cardinal: SÓ
// requireActiveOrg (leitura) enxerga o cookie; requireActiveOrgParaMutacao
// bloqueia qualquer escrita quando a sessão é sintética. Fora daqui (ex.:
// tasks.actions.ts, que resolve contexto via requireSession direto) o cookie
// não tem NENHUM efeito — é só um detalhe interno deste módulo.
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

  const cookieValue = cookies().get(IMPERSONATION_COOKIE)?.value;
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
