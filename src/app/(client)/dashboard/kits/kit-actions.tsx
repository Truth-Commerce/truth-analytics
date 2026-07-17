'use client';

import { useTransition } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { statusKitBadge } from '@/modules/kits/kits-view-model';

import { descartarKitAction, virarTarefaAction } from './actions';

/** Mensagens pt-BR p/ os códigos de erro de kitParaTask — nunca mostra o código cru no toast. */
const ERRO_VIRAR_TAREFA: Record<string, string> = {
  kit_ja_processado: 'Este kit já foi processado — recarregue a página.',
  kit_nao_encontrado: 'Kit não encontrado.',
  falha_criar_tarefa: 'Não foi possível criar a tarefa. Tente de novo.',
};

function mensagemErroVirarTarefa(erro?: string): string {
  return (erro && ERRO_VIRAR_TAREFA[erro]) || 'Algo deu errado. Tente de novo.';
}

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
        toast({ variant: 'error', title: 'Não foi possível virar tarefa.', description: mensagemErroVirarTarefa(res.erro) });
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
