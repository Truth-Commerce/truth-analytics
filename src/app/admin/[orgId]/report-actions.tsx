'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { adminReprocessReportAction, type AdminActionState } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

const initial: AdminActionState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending} data-testid="reprocessar-relatorio">
      {pending ? 'Reprocessando…' : 'Reprocessar'}
    </Button>
  );
}

export function ReportActions({ reportId }: { reportId: string }) {
  const [state, action] = useFormState(adminReprocessReportAction, initial);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) toast({ title: 'Relatório reenfileirado.', variant: 'success' });
    if (state.error) toast({ title: state.error, variant: 'error' });
  }, [state, toast]);

  return (
    <form action={action}>
      <input type="hidden" name="reportId" value={reportId} />
      <Submit />
    </form>
  );
}
