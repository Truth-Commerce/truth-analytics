import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatBRL } from '@/lib/format';
import type { ProgressoMeta } from '@/modules/reports/compare';

type Props = { progresso: ProgressoMeta | null; meta: number | null; totalMes: number };

export function MetaProgress({ progresso, meta, totalMes }: Props) {
  if (!progresso || meta === null) return null;
  const largura = Math.min(100, progresso.percentual);
  return (
    <Card data-testid="meta-progress">
      <CardHeader>
        <CardTitle as="h2" className="text-base">
          Meta do mês
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-mono text-white">{formatBRL(totalMes)}</span>
          <span className="text-muted">
            de {formatBRL(meta)} ({progresso.percentual}%)
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-white/5">
          <div
            className="h-2.5 rounded-full bg-brand shadow-[0_0_12px_#07dd2b66,0_0_24px_#07dd2b33]"
            style={{ width: `${largura}%` }}
          />
        </div>
        <p className="text-xs text-dim">
          {progresso.atingida
            ? 'Meta do mês atingida! 🎯'
            : `Faltam ${formatBRL(progresso.restante)} para a meta.`}
        </p>
      </CardContent>
    </Card>
  );
}
