'use client';

import { useRef, useState } from 'react';

import { devolverTaskFormAction } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * Botão "Devolver" reutilizado pela fila de revisão (RevisaoQueue) e pelo
 * cabeçalho do detalhe da task (TaskDetail) — Task 11. Abre um ConfirmDialog
 * com um textarea de motivo (opcional); ao confirmar, dispara o form oculto
 * que chama `devolverTaskFormAction` (motivo vira comentário quando preenchido).
 */
export function DevolverTaskButton({
  taskId,
  orgId,
  titulo,
}: {
  taskId: string;
  orgId: string;
  titulo: string;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={devolverTaskFormAction}>
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="motivo" value={motivo} />
      </form>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        data-testid="devolver-task"
        onClick={() => {
          setMotivo('');
          setOpen(true);
        }}
      >
        Devolver
      </Button>

      <ConfirmDialog
        open={open}
        title={`Devolver "${titulo}"?`}
        description={
          <label className="block text-left">
            <span className="mb-1 block text-xs text-dim">Motivo (opcional)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-lg border border-line bg-bg-elevated px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
            />
          </label>
        }
        confirmLabel="Devolver"
        variant="default"
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
