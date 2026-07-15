import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatBRL } from '@/lib/format';
import type { PaceMeta, ProgressoMeta } from '@/modules/reports/compare';

type Props = {
  progresso: ProgressoMeta | null;
  meta: number | null;
  totalMes: number;
  pace: PaceMeta | null;
  dadosAte: string | null;
};

export function MetaProgress({ progresso, meta, totalMes, pace, dadosAte }: Props) {
  if (!progresso || meta === null) {
    // Empty state honesto: a conta é madura mas o admin não definiu meta.
    return (
      <Card data-testid="meta-progress-empty">
        <CardHeader>
          <CardTitle as="h2" className="text-base">Meta do mês</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Sua meta ainda não foi definida — fale com seu analista.
          </p>
        </CardContent>
      </Card>
    );
  }
  const largura = Math.min(100, progresso.percentual);
  const marcador = pace ? Math.min(100, pace.pctEsperado) : null;
  return (
    <Card data-testid="meta-progress">
      <CardHeader>
        <CardTitle as="h2" className="text-base">Meta do mês</CardTitle>
        {dadosAte ? <span className="text-xs text-dim">dados até {dadosAte}</span> : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-mono text-white">{formatBRL(totalMes)}</span>
          <span className="text-muted">
            de {formatBRL(meta)} ({progresso.percentual}%)
          </span>
        </div>
        <div className="relative h-2.5 rounded-full bg-white/5">
          <div
            className="h-2.5 rounded-full bg-brand shadow-[0_0_12px_#07dd2b66,0_0_24px_#07dd2b33]"
            style={{ width: `${largura}%` }}
          />
          {marcador !== null ? (
            <div
              aria-hidden="true"
              title={`Esperado até hoje: ~${pace!.pctEsperado}%`}
              className="absolute -top-[3px] h-4 w-0.5 rounded bg-white/40"
              style={{ left: `${marcador}%` }}
            />
          ) : null}
        </div>
        {pace ? (
          <p className="text-xs text-muted" data-testid="meta-pace">
            {pace.mensagem}
          </p>
        ) : null}
        <p className="text-xs text-dim">
          {progresso.atingida
            ? 'Meta do mês atingida! 🎯'
            : pace
              ? `Faltam ${formatBRL(progresso.restante)} — no ritmo atual, o mês fecha em ~${formatBRL(pace.projecao)}.`
              : `Faltam ${formatBRL(progresso.restante)} para a meta.`}
        </p>
      </CardContent>
    </Card>
  );
}
