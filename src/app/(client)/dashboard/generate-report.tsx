'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { generateReportAction, type GenerateState } from '@/actions/reports.actions';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

const initial: GenerateState = {};

const ERROR_LABELS: Record<string, string> = {
  org_inativa: 'Organização inativa.',
  sem_plano: 'Nenhum plano definido. Fale com o suporte.',
  ciclo_em_andamento: 'O próximo relatório ainda não foi liberado.',
  bling_nao_conectado: 'Conecte o Bling em Conexões.',
  org_nao_encontrada: 'Organização não encontrada. Recarregue a página.',
  falha_geracao: 'Falha ao gerar o relatório. Tente novamente.',
};

function errorLabel(code: string): string {
  return ERROR_LABELS[code] ?? code;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      data-testid="generate-report-button"
      disabled={pending || disabled}
      variant="primary"
      className="gap-2"
    >
      {pending ? (
        <>
          <Spinner size="sm" />
          Gerando…
        </>
      ) : (
        'Gerar análise'
      )}
    </Button>
  );
}

export function GenerateReport({
  disabled,
  motivo,
}: {
  disabled?: boolean;
  motivo?: string;
}) {
  const [state, action] = useFormState(generateReportAction, initial);
  const isDisabled = !!disabled;

  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={isDisabled} />
        {isDisabled && motivo ? (
          <span className="text-sm text-muted">{motivo}</span>
        ) : null}
      </form>
      {state.error ? (
        <p className="mt-3 text-sm text-red-400">{errorLabel(state.error)}</p>
      ) : null}
      {state.reportId && !state.error ? (
        <p className="mt-3 text-sm text-brand">Relatório gerado.</p>
      ) : null}
    </div>
  );
}
