'use client';

import { useFormState } from 'react-dom';

import { adminTransferCarteiraAction, type TransferCarteiraState } from '@/actions/admin.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';

const initial: TransferCarteiraState = {};

type Analista = { id: string; email: string };

export function TransferirCarteiraForm({ analistas }: { analistas: Analista[] }) {
  const [state, action] = useFormState(adminTransferCarteiraAction, initial);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Move TODAS as organizações hoje atribuídas ao analista de origem para o analista de destino.
        Cada organização é auditada individualmente.
      </p>
      <form
        action={action}
        className="flex flex-wrap items-end gap-3"
        data-testid="usuarios-transferir-form"
      >
        <Field label="Analista de origem" htmlFor="usuarios-transferir-origem" className="min-w-56">
          <Select id="usuarios-transferir-origem" name="origemAnalistaUserId" data-testid="usuarios-transferir-origem">
            <option value="">Selecione…</option>
            {analistas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Analista de destino" htmlFor="usuarios-transferir-destino" className="min-w-56">
          <Select id="usuarios-transferir-destino" name="destinoAnalistaUserId" data-testid="usuarios-transferir-destino">
            <option value="">Selecione…</option>
            {analistas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="primary" size="sm" data-testid="usuarios-transferir-submit">
          Transferir carteira
        </Button>
      </form>

      {state.error ? (
        <Alert variant="danger" data-testid="usuarios-transferir-erro">
          {state.error}
        </Alert>
      ) : null}
      {state.ok ? (
        <Alert variant="success" data-testid="usuarios-transferir-sucesso">
          {state.count === 0
            ? 'O analista de origem não tinha nenhuma organização na carteira.'
            : `${state.count} organizaç${state.count === 1 ? 'ão' : 'ões'} transferida${state.count === 1 ? '' : 's'} com sucesso.`}
        </Alert>
      ) : null}
    </div>
  );
}
