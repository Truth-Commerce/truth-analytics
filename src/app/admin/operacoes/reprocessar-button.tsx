'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { adminReprocessReportAction, type AdminActionState } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

const initial: AdminActionState = {};

function Submit({ reportId }: { reportId: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      disabled={pending}
      data-testid={`operacoes-reprocessar-${reportId}`}
    >
      {pending ? 'Reprocessando…' : 'Reprocessar'}
    </Button>
  );
}

/**
 * Botão "Reprocessar" da fila cross-org do centro de operações (H4 T10) —
 * REUSA a mesma action `adminReprocessReportAction` (e, por baixo,
 * `requeueFailedReport`) já usada na tela de detalhe do cliente
 * (report-actions.tsx); só o testid muda (namespace `operacoes-*` por
 * relatório, já que aqui há várias linhas na mesma tela).
 */
export function ReprocessarButton({ reportId }: { reportId: string }) {
  const [state, action] = useFormState(adminReprocessReportAction, initial);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) toast({ title: 'Relatório reenfileirado.', variant: 'success' });
    if (state.error) toast({ title: state.error, variant: 'error' });
  }, [state, toast]);

  return (
    <form action={action}>
      <input type="hidden" name="reportId" value={reportId} />
      <Submit reportId={reportId} />
    </form>
  );
}
