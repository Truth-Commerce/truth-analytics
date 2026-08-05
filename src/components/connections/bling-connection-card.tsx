import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { OlistOAuthSurface as ConnectionOAuthSurface } from '@/modules/connections/olist-oauth-attempt';
import type { ErpConnectionReadModel } from '@/modules/connections/provider-connection.repository';

export function BlingConnectionCard(props: {
  orgId: string;
  surface: ConnectionOAuthSurface;
  readModel: ErpConnectionReadModel;
}) {
  const connected = props.readModel.bling?.authorized ?? false;
  const href = `/api/connections/bling?orgId=${encodeURIComponent(props.orgId)}&surface=${props.surface}`;

  return (
    <Card data-testid="bling-connection-card" lift={false}>
      <CardHeader>
        <CardTitle as="h2" className="text-base">Bling</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <p data-testid="bling-status" className={connected ? 'text-sm font-medium text-brand' : 'text-sm text-muted'}>
          {connected ? 'Conectado ✓' : 'Não conectado'}
        </p>
        <Button as="a" href={href} variant={connected ? 'secondary' : 'primary'} size="sm">
          {connected ? 'Reconectar Bling' : 'Conectar Bling'}
        </Button>
      </CardContent>
    </Card>
  );
}
