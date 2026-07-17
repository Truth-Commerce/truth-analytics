'use client';

import { useTransition } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { statusKitBadge } from '@/modules/kits/kits-view-model';

import { descartarKitAction, virarTarefaAction } from './actions';

/** Ações do kit sugerido: "Virar tarefa" (cria no CRM) e "Descartar". Fora de
 * 'sugerido', mostra só o badge de status (mesmo componente de Task 5). */
export function KitActions({ kitId, status, titulo }: { kitId: string; status: string; titulo: string }) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  if (status !== 'sugerido') {
    const badge = statusKitBadge(status);
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  }

  function virarTarefa() {
    startTransition(async () => {
      const res = await virarTarefaAction(kitId);
      if (res.ok) {
        toast({ variant: 'success', title: `Tarefa criada: "${titulo}"`, description: 'Confira no Plano de Ação.' });
      } else {
        toast({ variant: 'error', title: 'Não foi possível virar tarefa.', description: res.erro });
      }
    });
  }

  function descartar() {
    startTransition(async () => {
      const res = await descartarKitAction(kitId);
      if (!res.ok) {
        toast({ variant: 'error', title: 'Não foi possível descartar o kit.' });
      }
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={pending}
        onClick={virarTarefa}
        data-testid="kits-virar-tarefa"
      >
        Virar tarefa
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={descartar}
        data-testid="kits-descartar"
      >
        Descartar
      </Button>
    </div>
  );
}
