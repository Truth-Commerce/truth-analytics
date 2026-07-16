import Link from 'next/link';

import type { MeuDia, MeuDiaItem } from '@/modules/analista/analista.repository';
import { labelPrazo } from '@/modules/tasks/sla';

function ListaExpandivel({
  rotulo,
  itens,
  tom,
}: {
  rotulo: string;
  itens: MeuDiaItem[];
  tom: 'danger' | 'warn' | 'brand' | 'dim';
}) {
  const cor =
    tom === 'danger'
      ? 'text-danger-fg'
      : tom === 'warn'
        ? 'text-warning-fg'
        : tom === 'brand'
          ? 'text-brand'
          : 'text-dim';
  return (
    <details className="rounded-xl border border-line bg-bg-surface px-4 py-2">
      <summary className={`cursor-pointer text-sm font-semibold ${cor}`}>
        {rotulo} ({itens.length})
      </summary>
      {itens.length === 0 ? (
        <p className="py-2 text-xs text-dim">Nada por aqui.</p>
      ) : (
        <ul className="space-y-1 py-2">
          {itens.map((t) => (
            <li key={t.taskId} className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href={`/analista/${t.orgId}/tasks/${t.taskId}`}
                className="text-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                {t.titulo}
              </Link>
              <span className="text-xs text-dim">{t.orgName}</span>
              {labelPrazo(t.prazo) ? <span className="text-xs text-muted">{labelPrazo(t.prazo)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Faixa consolidada do analista: o que precisa de atenção HOJE, cross-org. */
export function MeuDiaFaixa({ meuDia }: { meuDia: MeuDia }) {
  return (
    <section data-testid="meu-dia" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <ListaExpandivel rotulo="Atrasadas" itens={meuDia.atrasadas} tom="danger" />
      <ListaExpandivel rotulo="Vencem em 7d" itens={meuDia.vencem7d} tom="warn" />
      <ListaExpandivel rotulo="Em revisão" itens={meuDia.emRevisao} tom="brand" />
      <ListaExpandivel rotulo="Sem atividade há 14d" itens={meuDia.semAtividade14d} tom="dim" />
    </section>
  );
}
