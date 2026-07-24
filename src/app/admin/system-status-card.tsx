import { serverEnv } from '@/lib/env';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { statusDoSistema } from '@/modules/admin/system-status';

/**
 * Server component PURO (roda só no servidor — lê serverEnv, nunca expõe
 * valores, só presença/ausência). Badge success/warn + consequência pt-BR.
 */
export function SystemStatusCard() {
  const itens = statusDoSistema(serverEnv);
  return (
    <Card data-testid="system-status">
      <CardHeader>
        <CardTitle as="h2" className="text-base">
          Status do sistema
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2.5">
          {itens.map((item) => (
            <li key={item.chave} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={item.ok ? 'success' : 'warn'}>
                {item.ok ? 'Configurado' : item.opcional ? 'Opcional' : 'Ausente'}
              </Badge>
              <span className="text-ink/90">{item.nome}</span>
              <span className="text-muted">— {item.detalhe}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
