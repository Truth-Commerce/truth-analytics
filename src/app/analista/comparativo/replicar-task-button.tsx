'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';

import { replicarTaskAction } from './actions';

type OrgOpcao = { id: string; name: string };

/**
 * Botão + seletor de destino para "replicar" uma sugestão de "o que
 * funcionou" (task concluída com impacto positivo em outra org da
 * carteira). `orgOrigemId` nunca entra nas opções — replicar para a própria
 * org de origem não faz sentido nesta UI.
 */
export function ReplicarTaskButton({
  taskId,
  orgOrigemId,
  orgsDaCarteira,
}: {
  taskId: string;
  orgOrigemId: string;
  orgsDaCarteira: OrgOpcao[];
}) {
  const opcoes = orgsDaCarteira.filter((o) => o.id !== orgOrigemId);
  const [orgDestino, setOrgDestino] = useState(opcoes[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  if (opcoes.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="analista-comparativo-replicar">
      <Select
        aria-label="Organização de destino"
        value={orgDestino}
        onChange={(e) => setOrgDestino(e.target.value)}
        className="!w-auto"
        disabled={pending}
      >
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending || !orgDestino}
        data-testid="analista-comparativo-replicar-btn"
        onClick={() => {
          startTransition(async () => {
            const r = await replicarTaskAction(taskId, orgDestino);
            if (r.ok) {
              toast({ variant: 'success', title: 'Task replicada para a outra organização' });
            } else {
              toast({ variant: 'error', title: 'Não foi possível replicar', description: r.erro });
            }
          });
        }}
      >
        {pending ? 'Replicando…' : 'Replicar'}
      </Button>
    </div>
  );
}
