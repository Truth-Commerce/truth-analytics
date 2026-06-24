'use client';

import { useFormState } from 'react-dom';

import {
  activateClientAction,
  reactivateClientAction,
  setPlanoAction,
  suspendClientAction,
  type AdminActionState,
} from '@/actions/admin.actions';

const initial: AdminActionState = {};

type Props = {
  orgId: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  plano: string | null;
};

function PlanoSelect() {
  return (
    <select name="plano" className="border p-1" defaultValue="">
      <option value="" disabled>
        Plano…
      </option>
      <option value="weekly">Semanal</option>
      <option value="biweekly">Quinzenal</option>
      <option value="monthly">Mensal</option>
    </select>
  );
}

export function ClientRow({ orgId, name, status, plano }: Props) {
  const [actState, activate] = useFormState(activateClientAction, initial);
  const [suspState, suspend] = useFormState(suspendClientAction, initial);
  const [reactState, reactivate] = useFormState(reactivateClientAction, initial);
  const [planoState, changePlano] = useFormState(setPlanoAction, initial);
  const err = actState.error || suspState.error || reactState.error || planoState.error;

  return (
    <tr className="border-b" data-testid={`org-${orgId}`}>
      <td className="p-2">{name}</td>
      <td className="p-2" data-testid={`status-${orgId}`}>{status}</td>
      <td className="p-2">{plano ?? '—'}</td>
      <td className="p-2">
        <div className="flex flex-wrap items-center gap-2">
          {status === 'pending' ? (
            <form action={activate} className="flex gap-1">
              <input type="hidden" name="orgId" value={orgId} />
              <PlanoSelect />
              <button type="submit" className="bg-black px-2 text-white">Ativar</button>
            </form>
          ) : null}
          {status === 'active' ? (
            <>
              <form action={changePlano} className="flex gap-1">
                <input type="hidden" name="orgId" value={orgId} />
                <PlanoSelect />
                <button type="submit" className="border px-2">Trocar plano</button>
              </form>
              <form action={suspend}>
                <input type="hidden" name="orgId" value={orgId} />
                <button type="submit" className="border px-2">Suspender</button>
              </form>
            </>
          ) : null}
          {status === 'suspended' ? (
            <form action={reactivate}>
              <input type="hidden" name="orgId" value={orgId} />
              <button type="submit" className="border px-2">Reativar</button>
            </form>
          ) : null}
          {err ? <span className="text-sm text-red-600">{err}</span> : null}
        </div>
      </td>
    </tr>
  );
}
