'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';

import {
  addTrackedProductAction,
  removeTrackedProductAction,
  type ConnState,
} from '@/actions/connections.actions';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

const initial: ConnState = {};

type Produto = { id: string; nome: string; sku: string | null; ativo: boolean };

export function TrackedProducts({ produtos }: { produtos: Produto[] }) {
  const [addState, add] = useFormState(addTrackedProductAction, initial);
  const [rmState, remove] = useFormState(removeTrackedProductAction, initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const formsRef = useRef<Map<string, HTMLFormElement>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    if (addState.error) toast({ title: 'Não foi possível adicionar.', description: addState.error, variant: 'error' });
  }, [addState, toast]);

  useEffect(() => {
    if (rmState.error) toast({ title: 'Não foi possível remover.', description: rmState.error, variant: 'error' });
  }, [rmState, toast]);

  const pendente = produtos.find((p) => p.id === pendingId);

  return (
    <div>
      <form action={add} className="mb-5 grid gap-3 sm:grid-cols-3" data-testid="add-form">
        <Field label="Nome do produto" htmlFor="nome">
          <Input id="nome" name="nome" placeholder="Ex: Tênis Running Pro" />
        </Field>
        <Field label="SKU (opcional)" htmlFor="sku">
          <Input id="sku" name="sku" placeholder="Ex: TRP-001" />
        </Field>
        <Field label="Palavras-chave" htmlFor="keywords">
          <Input id="keywords" name="keywords" placeholder="tênis, corrida, running" />
        </Field>
        <div className="flex items-end sm:col-span-3">
          <Button type="submit" variant="primary" size="sm">
            Adicionar
          </Button>
        </div>
      </form>

      {addState.error ? (
        <p role="alert" className="mb-3 text-sm text-danger-fg">{addState.error}</p>
      ) : null}
      {rmState.error ? (
        <p role="alert" className="mb-3 text-sm text-danger-fg">{rmState.error}</p>
      ) : null}

      <ul className="flex flex-col divide-y divide-line">
        {produtos.map((p) => (
          <li
            key={p.id}
            data-testid={`produto-${p.id}`}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span className="text-white/90">
              {p.nome}
              {p.sku ? <span className="ml-1.5 font-mono text-xs text-muted">({p.sku})</span> : ''}
            </span>
            <form
              action={remove}
              ref={(el) => {
                if (el) formsRef.current.set(p.id, el);
                else formsRef.current.delete(p.id);
              }}
            >
              <input type="hidden" name="id" value={p.id} />
              <Button type="button" variant="danger" size="sm" onClick={() => setPendingId(p.id)}>
                Remover
              </Button>
            </form>
          </li>
        ))}
        {produtos.length === 0 ? (
          <li className="py-3">
            <EmptyState
              title="Nenhum produto ainda."
              description="Adicione os produtos que você quer acompanhar no mercado — eles alimentam o benchmark do relatório."
            />
          </li>
        ) : null}
      </ul>

      <ConfirmDialog
        open={pendingId !== null}
        title={`Remover ${pendente?.nome ?? 'este produto'}?`}
        description="O produto sai do monitoramento de mercado dos próximos relatórios."
        confirmLabel="Remover"
        onConfirm={() => {
          if (pendingId) formsRef.current.get(pendingId)?.requestSubmit();
          setPendingId(null);
        }}
        onCancel={() => setPendingId(null)}
      />
    </div>
  );
}
