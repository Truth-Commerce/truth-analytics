'use client';

import { useState, useTransition } from 'react';

import { ativarCicloAction, fecharCicloAction } from '@/actions/cycles.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stat } from '@/components/ui/Stat';
import { useToast } from '@/components/ui/Toast';
import { formatBRL } from '@/lib/format';
import type { Cycle, CycleStatus } from '@/modules/tasks/cycle.repository';
import type { Retrospectiva } from '@/modules/tasks/retrospectiva';

const STATUS_LABEL: Record<CycleStatus, string> = {
  planejado: 'Planejado',
  ativo: 'Ativo',
  fechado: 'Fechado',
};

const STATUS_BADGE_VARIANT: Record<CycleStatus, 'neutral' | 'mono' | 'success'> = {
  planejado: 'neutral',
  ativo: 'mono',
  fechado: 'success',
};

/**
 * Lista de todos os ciclos da org (H5/T9) — 'planejado' ganha um botão
 * Ativar, qualquer ciclo não-fechado ganha um botão Fechar (com confirmação,
 * já que fechar é irreversível — `fecharCiclo` não tem caminho de volta).
 * Ciclos 'fechado' mostram a retrospectiva (planejadas/concluídas/taxa/
 * impacto) calculada no servidor pela página — este componente só formata.
 */
export function CiclosList({
  ciclos,
  retrospectivas,
}: {
  ciclos: Cycle[];
  retrospectivas: Record<string, Retrospectiva>;
}) {
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [pendenteId, setPendenteId] = useState<string | null>(null);
  const [confirmFecharId, setConfirmFecharId] = useState<string | null>(null);

  function ativar(cycleId: string) {
    setPendenteId(cycleId);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('cycleId', cycleId);
      const res = await ativarCicloAction(fd);
      if (res.error) toast({ variant: 'error', title: 'Não foi possível ativar.', description: res.error });
      setPendenteId(null);
    });
  }

  function fechar(cycleId: string) {
    setConfirmFecharId(null);
    setPendenteId(cycleId);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('cycleId', cycleId);
      const res = await fecharCicloAction(fd);
      if (res.error) toast({ variant: 'error', title: 'Não foi possível fechar.', description: res.error });
      setPendenteId(null);
    });
  }

  if (ciclos.length === 0) {
    return (
      <EmptyState
        title="Nenhum ciclo criado ainda"
        description="Crie o primeiro ciclo no formulário acima."
        data-testid="crm-ciclos-vazio"
      />
    );
  }

  return (
    <div data-testid="crm-ciclos-lista" className="space-y-3">
      <h2 className="font-heading text-lg font-semibold text-ink">Ciclos</h2>
      {ciclos.map((ciclo) => {
        const retro = retrospectivas[ciclo.id];
        return (
          <Card key={ciclo.id} data-testid="crm-ciclos-item" className="space-y-3">
            <CardHeader>
              <div>
                <CardTitle as="h3" className="text-base">
                  {ciclo.nome}
                </CardTitle>
                <p className="text-xs text-muted">
                  {ciclo.inicio ?? 'sem início'} — {ciclo.fim ?? 'sem fim'}
                </p>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[ciclo.status]}>{STATUS_LABEL[ciclo.status]}</Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              {retro ? (
                <div data-testid="crm-ciclos-retro" className="flex flex-wrap gap-4">
                  <Stat label="Planejadas" value={retro.planejadas} data-testid="crm-ciclos-retro-planejadas" />
                  <Stat label="Concluídas" value={retro.concluidas} data-testid="crm-ciclos-retro-concluidas" />
                  <Stat label="Taxa" value={`${retro.taxaConclusao}%`} data-testid="crm-ciclos-retro-taxa" />
                  <Stat
                    label="Impacto (R$)"
                    value={formatBRL(retro.impactoBRL)}
                    data-testid="crm-ciclos-retro-impacto"
                  />
                </div>
              ) : (
                <span />
              )}

              <div className="flex gap-2">
                {ciclo.status === 'planejado' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid="crm-ciclos-ativar"
                    disabled={pendenteId === ciclo.id}
                    onClick={() => ativar(ciclo.id)}
                  >
                    Ativar
                  </Button>
                ) : null}
                {ciclo.status !== 'fechado' ? (
                  <Button
                    size="sm"
                    variant="danger"
                    data-testid="crm-ciclos-fechar"
                    disabled={pendenteId === ciclo.id}
                    onClick={() => setConfirmFecharId(ciclo.id)}
                  >
                    Fechar
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <ConfirmDialog
        open={confirmFecharId !== null}
        title="Fechar este ciclo?"
        description="Ao fechar, o ciclo não pode ser reaberto — a retrospectiva de impacto passa a ficar disponível aqui."
        confirmLabel="Fechar ciclo"
        onConfirm={() => {
          if (confirmFecharId) fechar(confirmFecharId);
        }}
        onCancel={() => setConfirmFecharId(null)}
      />
    </div>
  );
}
