import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { AlertaAberto } from '@/modules/alerts/alert.repository';
import { resolverAlertaAction } from '@/actions/alerts.actions';

export function AlertasSection({ alertas }: { alertas: AlertaAberto[] }) {
  if (alertas.length === 0) return null;
  return (
    <Card data-testid="alertas-section">
      <CardHeader>
        <CardTitle as="h2" className="text-base">Alertas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alertas.map((a) => (
          <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded border border-ink/10 p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={a.severidade === 'critico' ? 'danger' : 'warn'}>
                  {a.severidade === 'critico' ? 'Crítico' : 'Atenção'}
                </Badge>
                <p className="text-sm font-medium text-ink">{a.titulo}</p>
              </div>
              <p className="text-sm text-muted">{a.corpo}</p>
            </div>
            <form action={resolverAlertaAction}>
              <input type="hidden" name="alertId" value={a.id} />
              <button type="submit" className="text-sm text-brand hover:underline" data-testid={`resolver-alerta-${a.id}`}>
                Marcar resolvido
              </button>
            </form>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
