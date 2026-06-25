'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { generateReportAction, type GenerateState } from '@/actions/reports.actions';

const initial: GenerateState = {};

const ERROR_LABELS: Record<string, string> = {
  org_inativa: 'Organização inativa.',
  sem_plano: 'Nenhum plano definido. Fale com o suporte.',
  ciclo_em_andamento: 'O próximo relatório ainda não foi liberado.',
  bling_nao_conectado: 'Conecte o Bling em Conexões.',
  falha_geracao: 'Falha ao gerar o relatório. Tente novamente.',
};

function errorLabel(code: string): string {
  return ERROR_LABELS[code] ?? code;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="generate-report-button"
      disabled={pending || disabled}
      className="bg-black px-4 py-2 text-white disabled:opacity-50"
    >
      {pending ? 'Gerando…' : 'Gerar análise'}
    </button>
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
          <span className="text-sm text-gray-500">{motivo}</span>
        ) : null}
      </form>
      {state.error ? (
        <p className="mt-2 text-sm text-red-600">{errorLabel(state.error)}</p>
      ) : null}
      {state.reportId && !state.error ? (
        <p className="mt-2 text-sm text-green-700">Relatório gerado.</p>
      ) : null}
    </div>
  );
}
