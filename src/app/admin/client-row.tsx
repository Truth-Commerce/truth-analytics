'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useFormState } from 'react-dom';

import {
  activateClientAction,
  reactivateClientAction,
  setPlanoAction,
  suspendClientAction,
  type AdminActionState,
} from '@/actions/admin.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { TD, TR } from '@/components/ui/Table';
import { PLANO_LABEL, STATUS_ORG_LABEL } from '@/lib/labels';
import type { Plano } from '@/modules/auth/user.types';

const initial: AdminActionState = {};

type Props = {
  orgId: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  plano: string | null;
  conexao: 'ok' | 'expirado' | 'erro' | 'nenhuma';
};

function statusVariant(status: string): 'success' | 'warn' | 'danger' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'danger';
  if (status === 'pending') return 'warn';
  return 'neutral';
}

const CONEXAO_BADGE: Record<
  Props['conexao'],
  { variant: 'success' | 'warn' | 'danger' | 'neutral'; label: string }
> = {
  ok: { variant: 'success', label: 'Bling ok' },
  expirado: { variant: 'danger', label: 'Expirada' },
  erro: { variant: 'danger', label: 'Com erro' },
  nenhuma: { variant: 'neutral', label: 'Sem conexão' },
};

function PlanoSelect() {
  return (
    <Select name="plano" defaultValue="" className="!w-auto !py-1.5 text-sm">
      <option value="" disabled>
        Plano…
      </option>
      <option value="weekly">Semanal</option>
      <option value="biweekly">Quinzenal</option>
      <option value="monthly">Mensal</option>
    </Select>
  );
}

export function ClientRow({ orgId, name, status, plano, conexao }: Props) {
  const [actState, activate] = useFormState(activateClientAction, initial);
  const [suspState, suspend] = useFormState(suspendClientAction, initial);
  const [reactState, reactivate] = useFormState(reactivateClientAction, initial);
  const [planoState, changePlano] = useFormState(setPlanoAction, initial);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const suspendFormRef = useRef<HTMLFormElement>(null);
  const err = actState.error || suspState.error || reactState.error || planoState.error;

  return (
    <TR data-testid={`org-${orgId}`}>
      <TD>
        <Link href={`/admin/${orgId}`} className="text-white/90 hover:text-brand hover:underline">
          {name}
        </Link>
      </TD>
      <TD data-testid={`status-${orgId}`}>
        <Badge variant={statusVariant(status)}>{STATUS_ORG_LABEL[status]}</Badge>
      </TD>
      <TD className="font-mono text-muted">{plano ? (PLANO_LABEL[plano as Plano] ?? plano) : '—'}</TD>
      <TD data-testid={`conexao-${orgId}`}>
        <Badge variant={CONEXAO_BADGE[conexao].variant}>{CONEXAO_BADGE[conexao].label}</Badge>
      </TD>
      <TD>
        <div className="flex flex-wrap items-center gap-2">
          {status === 'pending' ? (
            <form action={activate} className="flex items-center gap-2">
              <input type="hidden" name="orgId" value={orgId} />
              <PlanoSelect />
              <Button type="submit" variant="primary" size="sm">
                Ativar
              </Button>
            </form>
          ) : null}
          {status === 'active' ? (
            <>
              <form action={changePlano} className="flex items-center gap-2">
                <input type="hidden" name="orgId" value={orgId} />
                <PlanoSelect />
                <Button type="submit" variant="secondary" size="sm">
                  Trocar plano
                </Button>
              </form>
              <form action={suspend} ref={suspendFormRef}>
                <input type="hidden" name="orgId" value={orgId} />
                <Button type="button" variant="danger" size="sm" onClick={() => setConfirmSuspend(true)}>
                  Suspender
                </Button>
              </form>
              <ConfirmDialog
                open={confirmSuspend}
                title={`Suspender ${name}?`}
                description="O cliente perde o acesso ao painel até ser reativado."
                confirmLabel="Suspender"
                onConfirm={() => {
                  setConfirmSuspend(false);
                  suspendFormRef.current?.requestSubmit();
                }}
                onCancel={() => setConfirmSuspend(false)}
              />
            </>
          ) : null}
          {status === 'suspended' ? (
            <form action={reactivate}>
              <input type="hidden" name="orgId" value={orgId} />
              <Button type="submit" variant="secondary" size="sm">
                Reativar
              </Button>
            </form>
          ) : null}
          {err ? <span className="text-sm text-danger-fg">{err}</span> : null}
        </div>
      </TD>
    </TR>
  );
}
