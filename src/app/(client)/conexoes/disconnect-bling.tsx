'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';

import { disconnectBlingAction, type ConnState } from '@/actions/connections.actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

const initial: ConnState = {};

export function DisconnectBling() {
  const [state, action] = useFormState(disconnectBlingAction, initial);
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: 'Não foi possível desconectar.', description: state.error, variant: 'error' });
  }, [state, toast]);

  return (
    <>
      <form ref={formRef} action={action}>
        <Button
          type="button"
          variant="danger"
          size="sm"
          data-testid="disconnect-bling"
          onClick={() => setConfirming(true)}
        >
          Desconectar
        </Button>
        {state.error ? <span className="ml-2 text-sm text-danger-fg" role="alert">{state.error}</span> : null}
      </form>
      <ConfirmDialog
        open={confirming}
        title="Desconectar o Bling?"
        description="A coleta de pedidos para os relatórios vai parar até você reconectar."
        confirmLabel="Desconectar"
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
