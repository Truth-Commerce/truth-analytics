import { iniciarImpersonationAction } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';

/**
 * Botão "Ver como cliente" (Task 12 H4) — só renderizado pela página quando
 * `org.status === 'active'` (o próprio iniciarImpersonationAction repete a
 * checagem no servidor; este componente não é a única defesa).
 */
export function VerComoCliente({ orgId }: { orgId: string }) {
  return (
    <form action={iniciarImpersonationAction.bind(null, orgId)}>
      <Button type="submit" variant="secondary" size="sm" data-testid="ver-como-cliente">
        Ver como cliente
      </Button>
    </form>
  );
}
