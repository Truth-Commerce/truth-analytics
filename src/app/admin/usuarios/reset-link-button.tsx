'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';

import { adminGenerateResetLinkAction, type ResetLinkState } from '@/actions/admin.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

const initial: ResetLinkState = {};

export function ResetLinkButton({ userId }: { userId: string }) {
  const [state, action] = useFormState(adminGenerateResetLinkAction, initial);
  const [copiado, setCopiado] = useState(false);

  async function copiarLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // clipboard indisponível (ex.: contexto não-seguro) — o link já está
      // visível/selecionável no texto abaixo, então isto é só um "nice to have".
    }
  }

  return (
    <div className="space-y-2">
      <form action={action} data-testid={`usuarios-reset-form-${userId}`}>
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="secondary" size="sm" data-testid={`usuarios-reset-btn-${userId}`}>
          Gerar link de reset
        </Button>
      </form>

      {state.error ? (
        <Alert variant="danger" data-testid={`usuarios-reset-erro-${userId}`}>
          {state.error}
        </Alert>
      ) : null}

      {state.ok && state.link ? (
        <Alert variant="success" data-testid={`usuarios-reset-link-${userId}`}>
          <p className="text-xs">
            Link de redefinição (uso único, expira em 60min) — copie e envie a{' '}
            <span className="font-mono">{state.email}</span>. Nunca compartilhe uma senha diretamente.
          </p>
          <p className="mt-1 break-all font-mono text-xs text-white/90" data-testid={`usuarios-reset-link-valor-${userId}`}>
            {state.link}
          </p>
          <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => copiarLink(state.link!)}>
            {copiado ? 'Copiado!' : 'Copiar link'}
          </Button>
        </Alert>
      ) : null}
    </div>
  );
}
