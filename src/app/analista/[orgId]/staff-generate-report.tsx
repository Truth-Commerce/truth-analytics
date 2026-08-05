'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { staffGenerateReportAction, type StaffReportState } from '@/actions/staff.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

type Props = {
  orgId: string;
  provider: 'bling' | 'olist' | null;
  reportInProgressId: string | null;
};

const initialState: StaffReportState = {};

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={disabled || pending}>
      {pending ? 'Iniciando…' : disabled ? 'Relatório em andamento' : 'Gerar relatório agora'}
    </Button>
  );
}

export function StaffGenerateReport({ orgId, provider, reportInProgressId }: Props) {
  const [state, action] = useFormState(staffGenerateReportAction, initialState);
  const providerLabel = provider === 'olist' ? 'Olist ERP ativo' : provider === 'bling' ? 'Bling ativo' : null;

  return (
    <Card data-testid="staff-generate-report">
      <CardHeader>
        <CardTitle as="h2">Gerar relatório</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {providerLabel ? <p className="text-sm text-muted">{providerLabel}</p> : <Alert variant="warning">Nenhum ERP ativo para este cliente.</Alert>}
        {providerLabel ? (
          <form action={action}>
            <input type="hidden" name="orgId" value={orgId} />
            <Submit disabled={Boolean(reportInProgressId)} />
          </form>
        ) : null}
        {state.ok ? <Alert variant="success">Relatório iniciado. A página será atualizada com o andamento.</Alert> : null}
        {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      </CardContent>
    </Card>
  );
}
