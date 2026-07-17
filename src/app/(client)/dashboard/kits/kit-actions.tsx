import { Badge } from '@/components/ui/Badge';
import { statusKitBadge } from '@/modules/kits/kits-view-model';

// Task 6 adiciona as ações (virar tarefa / descartar) — por enquanto só o badge de status.
export function KitActions({ status }: { kitId: string; status: string; titulo: string }) {
  const badge = statusKitBadge(status);
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}
