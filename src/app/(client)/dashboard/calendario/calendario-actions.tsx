'use client';

import { useTransition } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { statusSugestaoBadge } from '@/modules/calendario/calendario-view-model';

import { descartarSugestaoAction, virarTarefaSugestaoAction } from './actions';

/** Mensagens pt-BR p/ os códigos de erro de sugestaoParaTask — nunca mostra o código cru no toast. */
const ERRO_VIRAR_TAREFA: Record<string, string> = {
  sugestao_ja_processada: 'Esta sugestão já foi processada — recarregue a página.',
  sugestao_nao_encontrada: 'Sugestão não encontrada.',
  falha_criar_tarefa: 'Não foi possível criar a tarefa. Tente de novo.',
};

function mensagemErroVirarTarefa(erro?: string): string {
  return (erro && ERRO_VIRAR_TAREFA[erro]) || 'Algo deu errado. Tente de novo.';
}

/** Ações da sugestão sazonal: "Virar tarefa" (cria no CRM) e "Descartar". Fora
 * de 'sugerido', mostra só o badge de status (mesmo componente de Kits). */
export function CalendarioActions({
  sugestaoId,
  status,
  titulo,
}: {
  sugestaoId: string;
  status: string;
  titulo: string;
}) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  if (status !== 'sugerido') {
    const badge = statusSugestaoBadge(status);
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  }

  function virarTarefa() {
    startTransition(async () => {
      const res = await virarTarefaSugestaoAction(sugestaoId);
      if (res.ok) {
        toast({ variant: 'success', title: `Tarefa criada: "${titulo}"`, description: 'Confira no Plano de Ação.' });
      } else {
        toast({ variant: 'error', title: 'Não foi possível virar tarefa.', description: mensagemErroVirarTarefa(res.erro) });
      }
    });
  }

  function descartar() {
    startTransition(async () => {
      const res = await descartarSugestaoAction(sugestaoId);
      if (!res.ok) {
        toast({ variant: 'error', title: 'Não foi possível descartar a sugestão.' });
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
        data-testid="calendario-virar-tarefa"
      >
        Virar tarefa
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={descartar}
        data-testid="calendario-descartar"
      >
        Descartar
      </Button>
    </div>
  );
}
