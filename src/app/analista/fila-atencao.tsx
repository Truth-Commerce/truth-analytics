import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { OrgResumo } from '@/modules/analista/carteira-data.repository';
import { badgeDoNivel, filaAtencaoHoje } from '@/modules/analista/carteira-view-model';

/**
 * Fila "Atenção hoje" do command center (H4 T5) — só as orgs da carteira que
 * precisam de atenção (`risco.nivel !== 'ok'`), ordenadas por `risco.score`
 * desc (view-model puro em `carteira-view-model.ts`), com badge do nível,
 * top-3 motivos e ações-link: abrir a visão 360 sempre, e "Conexões" quando
 * o motivo é de token (Bling). RSC-safe (sem estado).
 *
 * Dois estados vazios distintos: carteira sem nenhuma org (admin ainda não
 * atribuiu clientes) vs. carteira com orgs mas todas 'ok' (nada a fazer hoje
 * — estado positivo, não é um erro).
 *
 * NOTA: a visão 360 (`/analista/[orgId]`) ainda não tem uma seção dedicada de
 * Conexões (isso é T6) — o link já aponta com `?tab=conexao` para que T6
 * possa ler `searchParams.tab` e abrir a aba certa; até lá, ele só abre a
 * página normalmente (nenhum comportamento quebrado).
 */
export function FilaAtencaoHoje({ resumos }: { resumos: OrgResumo[] }) {
  const fila = filaAtencaoHoje(resumos);

  if (resumos.length === 0) {
    return (
      <EmptyState
        data-testid="analista-fila-atencao-vazia"
        title="Nenhuma organização na carteira."
        description="Peça ao admin para atribuir clientes a você."
      />
    );
  }

  if (fila.length === 0) {
    return (
      <EmptyState
        data-testid="analista-atencao-vazio"
        title="Nenhuma loja precisa de atenção agora"
        description="Todas as orgs da sua carteira estão 'Ok'. Volte mais tarde ou confira a carteira completa."
      />
    );
  }

  return (
    <ul
      data-testid="analista-fila-atencao"
      className="divide-y divide-line rounded-2xl border border-line bg-bg-surface"
    >
      {fila.map((row) => {
        const badge = badgeDoNivel(row.nivel);
        return (
          <li
            key={row.orgId}
            data-testid="analista-fila-atencao-row"
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-white">{row.orgName}</span>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              {row.motivosTop3.length > 0 ? (
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-dim">
                  {row.motivosTop3.map((motivo) => (
                    <li key={motivo}>{motivo}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-dim">Sem indícios de risco.</p>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Link
                href={`/analista/${row.orgId}`}
                className="text-brand outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                Abrir 360 →
              </Link>
              {row.mostrarLinkConexoes ? (
                <Link
                  href={`/analista/${row.orgId}?tab=conexao`}
                  data-testid="analista-fila-atencao-link-conexoes"
                  className="text-brand outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  Conexões →
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
