'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { adminGenerateReportAction, type AdminActionState } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

const initial: AdminActionState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending} data-testid="gerar-relatorio-admin">
      {pending ? 'Disparando…' : 'Gerar relatório agora'}
    </Button>
  );
}

export function GenerateNow({ orgId }: { orgId: string }) {
  const [state, action] = useFormState(adminGenerateReportAction, initial);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) toast({ title: 'Relatório disparado.', description: 'Acompanhe o status na aba Relatórios.', variant: 'success' });
    if (state.error) toast({ title: state.error, variant: 'error' });
  }, [state, toast]);

  return (
    <form action={action}>
      <input type="hidden" name="orgId" value={orgId} />
      <Submit />
    </form>
  );
}
